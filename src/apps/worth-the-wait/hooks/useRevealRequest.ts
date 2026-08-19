import { doc, updateDoc } from 'firebase/firestore';
import { useCallback } from 'react';

import { db } from '@lib/firebase/config';

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

  // TODO: will be moved to a cloud function in the future
  const startAction = useCallback(
    async (method: RevealMethod) => {
      if (!spaceId || !userUid) {
        return;
      }

      const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
      await updateDoc(spaceRef, {
        activeAction: {
          actionId: `${userUid}-${box.id}-${method}-${Date.now()}`,
          boxId: box.id,
          method,
          status: 'initiating',
          selectedItemIds: [],
          initiatedBy: userUid,
          startedAt: Date.now(),
          completedAt: null,
        },
      });
    },
    [box.id, spaceId, userUid],
  );

  return { toggleRevealRequest, startAction };
}

export default useRevealRequest;
