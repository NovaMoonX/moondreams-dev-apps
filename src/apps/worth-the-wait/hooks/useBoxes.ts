import { auth, db } from '@lib/firebase/config';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  encryptStringForSpace,
  normalizeSpaceEncryption,
  type SpaceEncryption,
} from '../security';

import type { Box, BoxDraft } from '../types';
import { getDefaultBoxes, normalizeBox } from '../utils/boxHelpers';

const limitDescription = (description: string) => description.trim();

async function getSpaceEncryption(
  spaceId: string,
): Promise<SpaceEncryption | null> {
  const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
  const spaceSnapshot = await getDoc(spaceRef);

  return normalizeSpaceEncryption(spaceSnapshot.data()?.encryption ?? null);
}

export function useBoxes(spaceId: string, userUid?: string) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(Boolean(spaceId && userUid));
  const [error, setError] = useState<string | null>(null);
  const hasSeededDefaults = useRef(false);

  useEffect(() => {
    if (!spaceId || !userUid) {
      hasSeededDefaults.current = false;
      return;
    }

    const boxCollection = collection(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'boxes',
    );
    let isActive = true;

    const unsubscribe = onSnapshot(
      boxCollection,
      async (snapshot) => {
        if (!isActive) {
          return;
        }

        const spaceEncryption = await getSpaceEncryption(spaceId);
        const nextBoxes = (
          await Promise.all(
            snapshot.docs.map(async (documentSnapshot) =>
              normalizeBox(
                documentSnapshot.id,
                documentSnapshot.data() as DocumentData,
                spaceEncryption,
              ),
            ),
          )
        ).sort((left, right) => {
          if (left.createdAt === right.createdAt) {
            return left.name.localeCompare(right.name);
          }

          return left.createdAt - right.createdAt;
        });

        setBoxes(nextBoxes);
        setLoading(false);

        if (snapshot.docs.length === 0 && !hasSeededDefaults.current) {
          hasSeededDefaults.current = true;
          const defaultBoxes = getDefaultBoxes();
          const encryptedDefaults = await Promise.all(
            defaultBoxes.map(async (box) => {
              const encryptedName = await encryptStringForSpace(
                box.name,
                spaceEncryption,
              );
              const encryptedEmoji = await encryptStringForSpace(
                box.emoji,
                spaceEncryption,
              );
              const encryptedDescription = await encryptStringForSpace(
                box.description,
                spaceEncryption,
              );

              return {
                ...box,
                id: box.id,
                name: encryptedName,
                emoji: encryptedEmoji,
                description: encryptedDescription,
              };
            }),
          );

          await Promise.all(
            encryptedDefaults.map((box) =>
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
  }, [spaceId, userUid]);

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
      const spaceEncryption = await getSpaceEncryption(spaceId);
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

      await setDoc(boxRef, {
        ...payload,
        name: await encryptStringForSpace(trimmedName, spaceEncryption),
        emoji: await encryptStringForSpace(
          draft.emoji.trim() || '✨',
          spaceEncryption,
        ),
        description: await encryptStringForSpace(
          trimmedDescription,
          spaceEncryption,
        ),
      });
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
      const spaceEncryption = await getSpaceEncryption(spaceId);

      await updateDoc(boxRef, {
        name: await encryptStringForSpace(trimmedName, spaceEncryption),
        emoji: await encryptStringForSpace(
          draft.emoji.trim() || '✨',
          spaceEncryption,
        ),
        description: await encryptStringForSpace(
          trimmedDescription,
          spaceEncryption,
        ),
        lastEditedAt: Date.now(),
      });
    },
    [spaceId],
  );

  const deleteBox = useCallback(
    async (boxId: string) => {
      if (!spaceId || !boxId) {
        return;
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
      await deleteDoc(boxRef);
    },
    [spaceId],
  );

  const visibleBoxes = useMemo(
    () => (spaceId && userUid ? boxes : []),
    [spaceId, userUid, boxes],
  );
  const visibleLoading = Boolean(spaceId && userUid) && loading;
  const visibleError = spaceId && userUid ? error : null;

  return {
    boxes: visibleBoxes,
    loading: visibleLoading,
    error: visibleError,
    createCustomBox,
    editCustomBox,
    deleteBox,
  };
}
