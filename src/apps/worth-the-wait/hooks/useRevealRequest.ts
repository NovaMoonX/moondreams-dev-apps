import { doc, updateDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';

import { db, functions } from '@lib/firebase/config';

import { httpsCallable } from 'firebase/functions';
import type { Box, RevealMethod, RevealStartRequest } from '../types';

interface UseRevealRequestArgs {
  spaceId: string;
  userUid?: string;
}

export function useRevealRequest({ spaceId, userUid }: UseRevealRequestArgs) {
  const [loading, setLoading] = useState(false);

  const toggleRevealRequest = useCallback(
    async (box: Box, method: RevealMethod) => {
      if (!userUid) {
        return;
      }

      const boxRef = doc(
        db,
        'apps',
        'worth-the-wait',
        'spaces',
        spaceId,
        'boxes',
        box.id,
      );
      const currentUserRequest =
        box.revealRequestedBy.find((request) => request.userId === userUid) ??
        null;
      const nextRequests = box.revealRequestedBy.filter(
        (request) => request.userId !== userUid,
      );

      if (currentUserRequest?.method === method) {
        await updateDoc(boxRef, { revealRequestedBy: nextRequests });
        return;
      }

      await updateDoc(boxRef, {
        revealRequestedBy: [
          ...nextRequests,
          {
            userId: userUid,
            method,
            requestedAt: Date.now(),
          },
        ],
      });
    },
    [spaceId, userUid],
  );

  const setRevealStartRequest = useCallback(
    async ({ boxId, method }: { boxId: string; method: RevealMethod }) => {
      if (!spaceId || !userUid) {
        return;
      }

      const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
      const now = Date.now();

      await updateDoc(spaceRef, {
        revealStartRequest: {
          boxId,
          method,
          requestedBy: [userUid],
          requestedAt: now,
        },
        updatedAt: now,
      });
    },
    [spaceId, userUid],
  );

  const cancelRevealStartRequest = useCallback(
    async (request: RevealStartRequest | null) => {
      if (!spaceId || !userUid || !request) {
        return;
      }

      if (!request.requestedBy.includes(userUid)) {
        return;
      }

      const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
      const now = Date.now();

      await updateDoc(spaceRef, {
        revealStartRequest: null,
        updatedAt: now,
      });
    },
    [spaceId, userUid],
  );

  const startAction = useCallback(
    async ({ boxId, method }: { boxId: string; method: RevealMethod }) => {
      if (!spaceId || !userUid) {
        return;
      }
      setLoading(true);

      const triggerBoxAction = httpsCallable(functions, 'triggerBoxAction');

      try {
        await triggerBoxAction({
          spaceId,
          boxId,
          method,
        });
      } catch (error) {
        console.error('Error triggering box action:', error);
        throw new Error(
          'Failed to trigger box action. Please try again later.',
          {
            cause: error,
          },
        );
      } finally {
        setLoading(false);
      }
    },
    [spaceId, userUid],
  );

  return {
    toggleRevealRequest,
    setRevealStartRequest,
    cancelRevealStartRequest,
    startAction,
    loading,
  };
}

export default useRevealRequest;
