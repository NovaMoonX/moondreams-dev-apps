import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import type { Item, ItemDraft } from '../types';

function normalizeItem(id: string, data: DocumentData): Item {
  const methodValue = data.revealedMethod;

  return {
    id,
    authorId: typeof data.authorId === 'string' ? data.authorId : 'anonymous',
    content: typeof data.content === 'string' ? data.content : '',
    isRevealed: Boolean(data.isRevealed),
    revealedAt:
      typeof data.revealedAt === 'number' ? data.revealedAt : null,
    revealedMethod:
      methodValue === 'full_reveal' || methodValue === 'raffle'
        ? methodValue
        : null,
    createdAt:
      typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    lastEditedAt:
      typeof data.lastEditedAt === 'number' ? data.lastEditedAt : Date.now(),
  };
}

function createSpaceBoxIdKey(spaceId: string, boxId: string) {
  return `${spaceId}-${boxId}`;
}

export function useItems(spaceId: string, boxId: string) {
  const [spaceBoxId_, setSpaceBoxId_] = useState(createSpaceBoxIdKey(spaceId, boxId));
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
      (snapshot) => {
        if (!isActive) {
          return;
        }

        const nextItems = snapshot.docs
          .map((documentSnapshot) =>
            normalizeItem(documentSnapshot.id, documentSnapshot.data()),
          )
          .sort((left, right) => left.createdAt - right.createdAt);

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

      const nextContent = typeof content === 'string' ? content : content.content;
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
      const userId = auth.currentUser?.uid

      if (!userId) {
        throw new Error('You must be signed in to add an item.');
      }

      const now = Date.now();
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

      await setDoc(itemRef, nextItem);
      return nextItem;
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
