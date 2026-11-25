import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { FIGURE_INPUT_COLLECTIONS } from '../engine/engineConstants.js';
import {
  dueAfterChange,
  isCountedPlanChange,
  newReworkState,
  reworkPath,
  type ReworkState,
} from './reworkState.js';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'us-central1';

/** Alerts are judged in the same run, though they are not figure inputs, so a phone write to one never makes stored figures stale. */
const REWORK_COLLECTIONS: readonly string[] = [
  ...FIGURE_INPUT_COLLECTIONS,
  'alerts',
];

/** Counts a change on the plan's rework state: one more write seen, and the plan due no later than a gap after its last run. */
async function markRework(uid: string) {
  const firestore = getFirestore();
  const ref = firestore.doc(reworkPath(uid));
  // A bank sync writes hundreds of documents at once: when no run holds the plan and it is already due as
  // soon as it can be, the coming run reads this write anyway, so the contended transaction is skipped.
  const seen = await ref.get();
  const now = Date.now();
  if (seen.exists) {
    const state = seen.data() as ReworkState;
    if (state.leaseUntil <= now && state.dueAt <= dueAfterChange(state, now)) {
      return;
    }
  }
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.exists
      ? (snapshot.data() as ReworkState)
      : newReworkState(uid);
    transaction.set(ref, {
      ...state,
      seq: state.seq + 1,
      dueAt: dueAfterChange(state, Date.now()),
    });
  });
}

export const markRunwayReworkOnPlan = onDocumentWritten(
  { document: 'apps/runway/plans/{uid}', region: REGION },
  async (event) => {
    const { uid } = event.params;
    const after = event.data?.after;
    if (!after?.exists) {
      await getFirestore().doc(reworkPath(uid)).delete();
      return;
    }
    const before = event.data?.before;
    if (before?.exists && !isCountedPlanChange(before.data(), after.data())) {
      return;
    }
    await markRework(uid);
  },
);

export const markRunwayReworkOnItem = onDocumentWritten(
  { document: 'apps/runway/plans/{uid}/{collection}/{id}', region: REGION },
  async (event) => {
    if (!REWORK_COLLECTIONS.includes(event.params.collection)) return;
    await markRework(event.params.uid);
  },
);

export const markRunwayReworkOnRecord = onDocumentWritten(
  {
    document: 'apps/runway/plans/{uid}/days/{dayId}/records/{recordId}',
    region: REGION,
  },
  async (event) => {
    await markRework(event.params.uid);
  },
);
