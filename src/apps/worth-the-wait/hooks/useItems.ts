import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  encryptStringForSpace,
  normalizeSpaceEncryption,
  type SpaceEncryption,
} from '../security';
import type { Item, ItemDraft } from '../types';
import { normalizeItem } from '../utils/itemHelpers';

async function getSpaceEncryption(
  spaceId: string,
): Promise<SpaceEncryption | null> {
  const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
  const snapshot = await getDoc(spaceRef);

  return normalizeSpaceEncryption(snapshot.data()?.encryption ?? null);
}

export function useItems(spaceId: string, boxId?: string | null, userUid?: string) {
  const [itemsByBoxId, setItemsByBoxId] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(Boolean(spaceId && (userUid || boxId)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId || (!boxId && !userUid)) {
      setItemsByBoxId({});
      setLoading(false);
      setError(null);
      return;
    }

    let isActive = true;

    const loadItems = async () => {
      const spaceEncryption = await getSpaceEncryption(spaceId);
      const targetBoxIds = boxId
        ? [boxId]
        : (
            await getDocs(
              collection(db, 'apps', 'worth-the-wait', 'spaces', spaceId, 'boxes'),
            )
          ).docs.map((documentSnapshot) => documentSnapshot.id);

      const nextItemsByBoxId = Object.fromEntries(
        await Promise.all(
          targetBoxIds.map(async (targetBoxId) => {
            const itemCollection = collection(
              db,
              'apps',
              'worth-the-wait',
              'spaces',
              spaceId,
              'boxes',
              targetBoxId,
              'items',
            );
            const itemSnapshots = await getDocs(itemCollection);
            const nextItems = (
              await Promise.all(
                itemSnapshots.docs.map((documentSnapshot) =>
                  normalizeItem(
                    documentSnapshot.id,
                    documentSnapshot.data(),
                    spaceEncryption,
                  ),
                ),
              )
            ).sort((left, right) => left.createdAt - right.createdAt);

            return [targetBoxId, nextItems] as const;
          }),
        ),
      );

      if (isActive) {
        setItemsByBoxId(nextItemsByBoxId);
        setLoading(false);
      }
    };

    void loadItems().catch((queryError: Error) => {
      if (!isActive) {
        return;
      }

      setError(queryError.message);
      setLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [boxId, spaceId, userUid]);

  const items = useMemo(() => {
    if (boxId) {
      return itemsByBoxId[boxId] ?? [];
    }

    return Object.values(itemsByBoxId)
      .flat()
      .sort((left, right) => left.createdAt - right.createdAt);
  }, [boxId, itemsByBoxId]);

  const addItem = useCallback(
    async (targetBoxId: string, content: string | ItemDraft) => {
      if (!spaceId || !targetBoxId) {
        throw new Error('A space and box are required to add an item.');
      }

      const nextContent =
        typeof content === 'string' ? content : content.content;
      const trimmedContent = nextContent.trim();

      if (!trimmedContent) {
        throw new Error('Add a message before saving it.');
      }

      const itemsCollection = collection(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
        targetBoxId,
        'items',
      );
      const itemRef = doc(itemsCollection);
      const userId = auth.currentUser?.uid ?? userUid;

      if (!userId) {
        throw new Error('You must be signed in to add an item.');
      }

      const now = Date.now();
      const spaceEncryption = await getSpaceEncryption(spaceId);
      const encryptedContent = await encryptStringForSpace(
        trimmedContent,
        spaceEncryption,
      );
      const nextItem: Item = {
        id: itemRef.id,
        authorId: userId,
        content: trimmedContent,
        isRevealed: false,
        revealedAt: null,
        revealedMethod: null,
        createdAt: now,
        lastEditedAt: now,
      };

      try {
        await setDoc(itemRef, {
          ...nextItem,
          content: encryptedContent,
        });

        return nextItem;
      } catch (queryError) {
        throw new Error('Failed to add item. Please try again.', {
          cause: queryError,
        });
      }
    },
    [spaceId, userUid],
  );

  const deleteItem = useCallback(
    async (targetBoxId: string, itemId: string) => {
      if (!spaceId || !targetBoxId || !itemId) {
        return;
      }

      const itemRef = doc(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
        targetBoxId,
        'items',
        itemId,
      );

      await deleteDoc(itemRef);
    },
    [spaceId],
  );

  return { items, itemsByBoxId, loading, error, addItem, deleteItem };
}

export default useItems;
