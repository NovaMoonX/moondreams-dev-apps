import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
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

function createSpaceBoxIdsKey(spaceId: string, boxIds: string[]) {
  return `${spaceId}-${boxIds.join(',')}`;
}

export function useItems(
  spaceId: string,
  boxIds?: string[] | null,
  userUid?: string,
) {
  const [_spaceBoxIdsKey, _setSpaceBoxIdsKey] = useState(
    createSpaceBoxIdsKey(spaceId, boxIds ?? []),
  );
  const [itemsByBoxId, setItemsByBoxId] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(
    Boolean(spaceId && (userUid || (boxIds && boxIds.length > 0))),
  );
  const [error, setError] = useState<string | null>(null);

  const areBoxes = Boolean(boxIds && boxIds.length > 0);

  const latestSpaceBoxIdKey = createSpaceBoxIdsKey(spaceId, boxIds ?? []);
  if (_spaceBoxIdsKey !== latestSpaceBoxIdKey) {
    _setSpaceBoxIdsKey(latestSpaceBoxIdKey);
    setLoading(Boolean(spaceId && (userUid || areBoxes)));
    setError(null);
    setItemsByBoxId((currentItemsByBoxId) => {
      const nextItemsByBoxId = { ...currentItemsByBoxId };

      Object.keys(nextItemsByBoxId).forEach((currentBoxId) => {
        if (!(boxIds ?? []).includes(currentBoxId)) {
          delete nextItemsByBoxId[currentBoxId];
        }
      });

      return nextItemsByBoxId;
    });
  }

  useEffect(() => {
    if (!spaceId || (!userUid && (!boxIds || boxIds.length === 0))) {
      return;
    }

    let isActive = true;

    const targetBoxIds = boxIds ?? [];
    // setItemsByBoxId((currentItemsByBoxId) => {
    //   const nextItemsByBoxId = { ...currentItemsByBoxId };

    //   Object.keys(nextItemsByBoxId).forEach((currentBoxId) => {
    //     if (!targetBoxIds.includes(currentBoxId)) {
    //       delete nextItemsByBoxId[currentBoxId];
    //     }
    //   });

    //   return nextItemsByBoxId;
    // });

    const unsubscribeFns = targetBoxIds.map((targetBoxId) => {
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

      return onSnapshot(
        itemCollection,
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

          setItemsByBoxId((currentItemsByBoxId) => {
            const nextItemsByBoxId = { ...currentItemsByBoxId };

            Object.keys(nextItemsByBoxId).forEach((currentBoxId) => {
              if (!targetBoxIds.includes(currentBoxId)) {
                delete nextItemsByBoxId[currentBoxId];
              }
            });

            nextItemsByBoxId[targetBoxId] = nextItems;

            return nextItemsByBoxId;
          });
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
    });

    return () => {
      isActive = false;
      unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    };
  }, [_setSpaceBoxIdsKey, boxIds, spaceId, userUid, areBoxes]);

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

  const updateItem = useCallback(
    async (targetBoxId: string, itemId: string, content: string) => {
      if (!spaceId || !targetBoxId || !itemId) {
        return;
      }

      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error('Enter item text before saving the update.');
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
      const spaceEncryption = await getSpaceEncryption(spaceId);
      const encryptedContent = await encryptStringForSpace(
        trimmedContent,
        spaceEncryption,
      );

      await updateDoc(itemRef, {
        content: encryptedContent,
        lastEditedAt: Date.now(),
      });
    },
    [spaceId],
  );

  const revealItem = useCallback(
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

      await updateDoc(itemRef, {
        isRevealed: true,
        revealedAt: Date.now(),
        revealedMethod: 'full_reveal',
      });
    },
    [spaceId],
  );

  const getItemsByBoxId = useCallback(
    (targetBoxId: string) => {
      return itemsByBoxId[targetBoxId] ?? [];
    },
    [itemsByBoxId],
  );

  const visibleItems = useMemo(() => {
    const allItems = Object.values(itemsByBoxId).flat();
    return spaceId && (areBoxes || userUid) ? allItems : [];
  }, [spaceId, areBoxes, userUid, itemsByBoxId]);

  const visibleItemsByBoxId = useMemo(() => {
    return spaceId && (areBoxes || userUid) ? itemsByBoxId : {};
  }, [spaceId, areBoxes, userUid, itemsByBoxId]);

  const visibleLoading = Boolean(spaceId && (areBoxes || userUid)) && loading;
  const visibleError = spaceId && (areBoxes || userUid) ? error : null;

  return {
    items: visibleItems,
    itemsByBoxId: visibleItemsByBoxId,
    getItemsByBoxId,
    loading: visibleLoading,
    error: visibleError,
    addItem,
    deleteItem,
    updateItem,
    revealItem,
  };
}
