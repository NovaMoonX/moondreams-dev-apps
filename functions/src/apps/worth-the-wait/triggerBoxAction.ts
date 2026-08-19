import { randomInt } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const APP_PATH = 'apps/worth-the-wait';
const ACTION_DURATION_MS = {
  full_reveal: 2500,
  raffle: 5000,
} as const;

type RevealMethod = 'full_reveal' | 'raffle';

type IndexedActionRecord = {
  actionId: string;
  boxId: string;
  method: RevealMethod;
  status: 'initiating' | 'executing' | 'completed';
  selectedItemIds: string[];
  initiatedBy: string;
  startedAt: number | null;
  completedAt: number | null;
};

function isRevealMethod(value: unknown): value is RevealMethod {
  return value === 'full_reveal' || value === 'raffle';
}

function normalizeMembers(members: unknown): string[] {
  if (!Array.isArray(members)) {
    return [];
  }

  return members.filter(
    (member): member is string => typeof member === 'string',
  );
}

function normalizeRequestQueue(
  value: unknown,
): Array<{ userId: string; method: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const request = entry as Record<string, unknown>;
    const userId = typeof request.userId === 'string' ? request.userId : null;
    const method = typeof request.method === 'string' ? request.method : null;

    if (!userId || !method) {
      return [];
    }

    return [{ userId, method }];
  });
}

async function validatePresenceForMembers(
  statusDb: ReturnType<typeof getDatabase>,
  members: string[],
): Promise<void> {
  for (const memberUid of members) {
    const snapshot = await statusDb.ref(`status/${memberUid}`).once('value');
    const status = snapshot.val() as Record<string, unknown> | null;

    if (!status) {
      throw new HttpsError(
        'failed-precondition',
        `Member ${memberUid} is not present in Worth the Wait.`,
      );
    }

    const state = typeof status.state === 'string' ? status.state : null;
    const currentLocation =
      typeof status.currentLocation === 'string'
        ? status.currentLocation
        : null;

    if (state !== 'online' || currentLocation !== 'worth-the-wait') {
      throw new HttpsError(
        'failed-precondition',
        `Member ${memberUid} must be online and inside Worth the Wait to trigger a reveal.`,
      );
    }
  }
}

function assertMutualRequests(
  revealRequestedBy: unknown,
  members: string[],
  method: RevealMethod,
): void {
  const requestQueue = normalizeRequestQueue(revealRequestedBy);
  const memberSet = new Set(members);
  const matchingRequesters = new Set(
    requestQueue
      .filter((request) => request.method === method)
      .map((request) => request.userId)
      .filter((userId) => memberSet.has(userId)),
  );

  if (matchingRequesters.size !== members.length) {
    throw new HttpsError(
      'failed-precondition',
      'Both partners must request the same action before the reveal can begin.',
    );
  }
}

export const triggerBoxAction = onCall(
  { region: 'us-central1' },
  async (request) => {
    const authUid = request.auth?.uid;

    if (!authUid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to trigger a reveal.',
      );
    }

    const payload = request.data ?? {};
    const spaceId =
      typeof payload.spaceId === 'string' ? payload.spaceId.trim() : '';
    const boxId = typeof payload.boxId === 'string' ? payload.boxId.trim() : '';
    const method = typeof payload.method === 'string' ? payload.method : null;

    if (!spaceId || !boxId || !isRevealMethod(method)) {
      throw new HttpsError(
        'invalid-argument',
        'Provide a valid spaceId, boxId, and reveal method (full_reveal or raffle).',
      );
    }

    const firestore = getFirestore();
    const realtimeDb = getDatabase();
    const spaceRef = firestore.doc(`${APP_PATH}/spaces/${spaceId}`);
    const boxRef = firestore.doc(
      `${APP_PATH}/spaces/${spaceId}/boxes/${boxId}`,
    );

    const [spaceSnapshot, boxSnapshot] = await Promise.all([
      spaceRef.get(),
      boxRef.get(),
    ]);

    if (!spaceSnapshot.exists) {
      throw new HttpsError('not-found', `Space ${spaceId} does not exist.`);
    }

    if (!boxSnapshot.exists) {
      throw new HttpsError(
        'not-found',
        `Box ${boxId} does not exist in space ${spaceId}.`,
      );
    }

    const spaceData = spaceSnapshot.data() ?? {};
    const members = normalizeMembers(spaceData.members);

    if (members.length !== 2) {
      throw new HttpsError(
        'failed-precondition',
        'Worth the Wait spaces must contain exactly two members.',
      );
    }

    if (!members.includes(authUid)) {
      throw new HttpsError(
        'permission-denied',
        'You are not a member of this Worth the Wait space.',
      );
    }

    await validatePresenceForMembers(realtimeDb, members);
    assertMutualRequests(
      boxSnapshot.data()?.revealRequestedBy,
      members,
      method,
    );

    const startedAt = Date.now();
    const actionId = `${authUid}-${boxId}-${method}-${startedAt}`;

    await firestore.runTransaction(async (transaction) => {
      const currentSpace = await transaction.get(spaceRef);
      const currentAction = currentSpace.data()?.activeAction as
        Record<string, unknown> | null | undefined;

      if (currentAction && currentAction.status !== 'completed') {
        throw new HttpsError(
          'already-exists',
          'A reveal is already in progress.',
        );
      }

      transaction.update(spaceRef, {
        activeAction: {
          actionId,
          boxId,
          method,
          status: 'initiating',
          selectedItemIds: [],
          initiatedBy: authUid,
          startedAt,
          completedAt: null,
        },
      });
    });

    try {
      await spaceRef.update({
        'activeAction.status': 'executing',
      });

      const unrevealedItemsSnapshot = await boxRef
        .collection('items')
        .where('isRevealed', '==', false)
        .get();
      const unrevealedItems = unrevealedItemsSnapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ref: itemDoc.ref,
      }));

      const selectedItemIds: string[] = [];

      if (method === 'raffle') {
        if (unrevealedItems.length === 0) {
          
          throw new HttpsError(
            'failed-precondition',
            'No unrevealed items remain to raffle.',
          );
        }

        const winningIndex = randomInt(0, unrevealedItems.length);
        const winner = unrevealedItems[winningIndex];
        selectedItemIds.push(winner.id);

        await winner.ref.update({
          isRevealed: true,
          revealedAt: Date.now(),
          revealedMethod: 'raffle',
        });
      }

      if (method === 'full_reveal') {
        for (const item of unrevealedItems) {
          selectedItemIds.push(item.id);
          await item.ref.update({
            isRevealed: true,
            revealedAt: Date.now(),
            revealedMethod: 'full_reveal',
          });
        }
      }

      await spaceRef.update({
        'activeAction.status': 'executing',
        'activeAction.selectedItemIds': selectedItemIds,
      });

      const elapsedMs = Date.now() - startedAt;
      const targetDurationMs = ACTION_DURATION_MS[method];
      const remainingDelayMs = Math.max(0, targetDurationMs - elapsedMs);

      if (remainingDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelayMs));
      }

      const completedAt = Date.now();
      const historyEntry = {
        id: actionId,
        method,
        triggeredBy: authUid,
        revealedAt: completedAt,
        itemIds: selectedItemIds,
      };

      await firestore.runTransaction(async (transaction) => {
        const spaceTx = await transaction.get(spaceRef);
        const boxTx = await transaction.get(boxRef);
        const currentAction = (spaceTx.data()?.activeAction ??
          null) as IndexedActionRecord | null;
        const history = Array.isArray(boxTx.data()?.revealHistory)
          ? boxTx.data()?.revealHistory
          : [];

        transaction.update(boxRef, {
          revealRequestedBy: [],
          revealHistory: [...history, historyEntry],
        });

        transaction.update(spaceRef, {
          activeAction: {
            ...(currentAction ?? {
              actionId,
              boxId,
              method,
              status: 'initiating',
              selectedItemIds: [],
              initiatedBy: authUid,
              startedAt,
              completedAt: null,
            }),
            status: 'completed',
            selectedItemIds,
            completedAt,
          },
        });
      });

      return {
        success: true,
        actionId,
        method,
        itemIds: selectedItemIds,
      };
    } catch (error) {
      await spaceRef.update({
        'activeAction.status': 'completed',
        'activeAction.completedAt': Date.now(),
        'activeAction.selectedItemIds': [],
      });

      throw error;
    }
  },
);

export default triggerBoxAction;
