import { doc, updateDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';

import { db, functions } from '@lib/firebase/config';

import { httpsCallable } from 'firebase/functions';
import type { Box, RevealMethod } from '../types';

interface UseRevealRequestArgs {
  spaceId: string;
  box: Box;
  userUid?: string;
}

export function useRevealRequest({
  spaceId,
  box,
  userUid,
}: UseRevealRequestArgs) {
  const [loading, setLoading] = useState(false);

  const toggleRevealRequest = useCallback(
    async (method: RevealMethod) => {
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
    [box.id, box.revealRequestedBy, spaceId, userUid],
  );

  const startAction = useCallback(
    async (method: RevealMethod) => {
      if (!spaceId || !userUid) {
        return;
      }
      setLoading(true);

      const triggerBoxAction = httpsCallable(functions, 'triggerBoxAction');

      try {
        await triggerBoxAction({
          spaceId,
          boxId: box.id,
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
    [box.id, spaceId, userUid],
  );

  return { toggleRevealRequest, startAction, loading };
}

export default useRevealRequest;
