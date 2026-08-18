import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Box, BoxDraft } from '../types';
import { getDefaultBoxes, normalizeBox } from '../utils/boxHelpers';

const limitDescription = (description: string) => description.trim();

export function useBoxes(spaceId: string) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(Boolean(spaceId));
  const [error, setError] = useState<string | null>(null);
  const hasSeededDefaults = useRef(false);

  useEffect(() => {
    if (!spaceId) {
      hasSeededDefaults.current = false;
      return;
    }

    const boxCollection = collection(db, 'apps', 'worth-the-wait', 'spaces', spaceId, 'boxes');
    let isActive = true;

    const unsubscribe = onSnapshot(
      boxCollection,
      async (snapshot) => {
        if (!isActive) {
          return;
        }

        const nextBoxes = snapshot.docs
          .map((documentSnapshot) =>
            normalizeBox(documentSnapshot.id, documentSnapshot.data() as DocumentData),
          )
          .sort((left, right) => {
            if (left.createdAt === right.createdAt) {
              return left.name.localeCompare(right.name);
            }

            return left.createdAt - right.createdAt
          });

        setBoxes(nextBoxes);
        setLoading(false);

        if (snapshot.docs.length === 0 && !hasSeededDefaults.current) {
          hasSeededDefaults.current = true;
          const defaultBoxes = getDefaultBoxes();

          await Promise.all(
            defaultBoxes.map((box) =>
              setDoc(doc(boxCollection, box.id), {
                ...box,
                id: box.id,
              }),
            ),
          );
        }
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
  }, [spaceId]);

  const createCustomBox = useCallback(
    async (draft: BoxDraft) => {
      if (!spaceId) {
        throw new Error('A space is required to create a box.');
      }

      const trimmedName = draft.name.trim();
      const trimmedDescription = limitDescription(draft.description);

      if (!trimmedName) {
        throw new Error('Add a box name before creating it.');
      }

      if (trimmedDescription.length > 50) {
        throw new Error('Descriptions must be 50 characters or fewer.');
      }

      const boxCollection = collection(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
      );
      const boxRef = doc(boxCollection);
      const now = Date.now();
      const payload: Box = {
        id: boxRef.id,
        name: trimmedName,
        emoji: draft.emoji.trim() || '✨',
        description: trimmedDescription,
        isDefault: false,
        createdBy: auth.currentUser?.uid ?? 'anonymous',
        revealRequestedBy: [],
        revealHistory: [],
        createdAt: now,
        lastEditedAt: now,
      };

      await setDoc(boxRef, payload);
      return payload;
    },
    [spaceId],
  );

  

  const editCustomBox = useCallback(
    async (boxId: string, draft: BoxDraft) => {
      if (!spaceId || !boxId) {
        throw new Error('A space and box are required to update a box.');
      }

      const trimmedName = draft.name.trim();
      const trimmedDescription = limitDescription(draft.description);

      if (!trimmedName) {
        throw new Error('Add a box name before saving changes.');
      }

      if (trimmedDescription.length > 50) {
        throw new Error('Descriptions must be 50 characters or fewer.');
      }

      const boxRef = doc(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
        boxId,
      );

      await updateDoc(
        boxRef,
        {
          name: trimmedName,
          emoji: draft.emoji.trim() || '✨',
          description: trimmedDescription,
          lastEditedAt: Date.now(),
        },
      );
    },
    [spaceId],
  );

  const deleteBox = useCallback(
    async (boxId: string) => {
      if (!spaceId || !boxId) {
        return;
      }

      const boxRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId, 'boxes', boxId);
      await deleteDoc(boxRef);
    },
    [spaceId],
  );

  return { boxes, loading, error, createCustomBox, editCustomBox, deleteBox };
}
