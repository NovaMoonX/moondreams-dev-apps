import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  decryptStringForSpace,
  encryptStringForSpace,
  normalizeSpaceEncryption,
  type SpaceEncryption,
} from '../security';

import type { Item, ItemDraft } from '../types';

async function getSpaceEncryption(
  spaceId: string,
): Promise<SpaceEncryption | null> {
  const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
  const snapshot = await getDoc(spaceRef);

  return normalizeSpaceEncryption(snapshot.data()?.encryption ?? null);
}

async function normalizeItem(
  id: string,
  data: DocumentData,
  encryption: SpaceEncryption | null,
): Promise<Item> {
  const methodValue = data.revealedMethod;

  return {
    id,
    authorId: typeof data.authorId === 'string' ? data.authorId : 'anonymous',
    content: await decryptStringForSpace(data.content, encryption),
    isRevealed: Boolean(data.isRevealed),
    revealedAt: typeof data.revealedAt === 'number' ? data.revealedAt : null,
    revealedMethod:
      methodValue === 'full_reveal' || methodValue === 'raffle'
        ? methodValue
        : null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    lastEditedAt:
      typeof data.lastEditedAt === 'number' ? data.lastEditedAt : Date.now(),
  };
}

function createSpaceBoxIdKey(spaceId: string, boxId: string) {
  return `${spaceId}-${boxId}`;
}

export function useItems(spaceId: string, boxId: string) {
  const [spaceBoxId_, setSpaceBoxId_] = useState(
    createSpaceBoxIdKey(spaceId, boxId),
  );
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(Boolean(spaceId) && Boolean(boxId));
  const [error, setError] = useState<string | null>(null);

  if (spaceBoxId_ !== createSpaceBoxIdKey(spaceId, boxId)) {
    setSpaceBoxId_(createSpaceBoxIdKey(spaceId, boxId));
    setItems([]);
    setLoading(Boolean(spaceId) && Boolean(boxId));
    setError(null);
  }

  useEffect(() => {
    if (!spaceId || !boxId) {
      return;
    }

    const itemsCollection = collection(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'boxes',
      boxId,
      'items',
    );
    let isActive = true;

    const unsubscribe = onSnapshot(
      itemsCollection,
      async (snapshot) => {
        if (!isActive) {
          return;
        }

        const spaceEncryption = await getSpaceEncryption(spaceId);
        const nextItems = (
          await Promise.all(
            snapshot.docs.map((documentSnapshot) =>
              normalizeItem(
                documentSnapshot.id,
                documentSnapshot.data(),
                spaceEncryption,
              ),
            ),
          )
        ).sort((left, right) => left.createdAt - right.createdAt);

        setItems(nextItems);
        setLoading(false);
      },
      (queryError) => {
        if (!isActive) {
          return;
        }

        setError(queryError.message);
        setLoading(false);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [boxId, spaceId]);

  const addItem = useCallback(
    async (content: string | ItemDraft) => {
      if (!spaceId || !boxId) {
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
        boxId,
        'items',
      );
      const itemRef = doc(itemsCollection);
      const userId = auth.currentUser?.uid;

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
      } catch (error) {
        throw new Error('Failed to add item. Please try again.', {
          cause: error,
        });
      }
    },
    [boxId, spaceId],
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!spaceId || !boxId || !itemId) {
        return;
      }

      const itemRef = doc(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
        boxId,
        'items',
        itemId,
      );

      await deleteDoc(itemRef);
    },
    [boxId, spaceId],
  );

  return { items, loading, error, addItem, deleteItem };
}

export default useItems;
