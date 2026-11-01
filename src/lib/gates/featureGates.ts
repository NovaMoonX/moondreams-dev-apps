import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import {
  type FeatureGateSetting,
  type FeatureGatesDoc,
  readGateSetting,
} from './gateAccess';

export * from './gateAccess';

export type GateExceptionList = 'alwaysOnUids' | 'alwaysOffUids';

/** What the admin chose for one switch, before it is saved. */
export type GateDraft = Pick<
  FeatureGateSetting,
  'rollout' | 'alwaysOnUids' | 'alwaysOffUids'
>;

function applyListChange(
  current: string[],
  before: string[],
  after: string[],
  otherAfter: string[],
) {
  const removed = before.filter((uid) => !after.includes(uid));
  const added = after.filter((uid) => !before.includes(uid));
  const kept = current.filter(
    (uid) => !removed.includes(uid) && !otherAfter.includes(uid),
  );
  return Array.from(new Set([...kept, ...added]));
}

/**
 * Admin only: saves the difference between what the sheet opened with and what the admin chose,
 * on top of the stored setting, so a change made elsewhere in the meantime is kept.
 */
export async function saveGateDraft(
  appId: string,
  gateId: string,
  before: GateDraft,
  after: GateDraft,
) {
  const gateRef = doc(db, 'featureGates', appId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(gateRef);
    const current = readGateSetting(
      snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null,
      appId,
      gateId,
    );
    const alwaysOnUids = applyListChange(
      current.alwaysOnUids,
      before.alwaysOnUids,
      after.alwaysOnUids,
      after.alwaysOffUids.filter((uid) => !before.alwaysOffUids.includes(uid)),
    );
    const alwaysOffUids = applyListChange(
      current.alwaysOffUids,
      before.alwaysOffUids,
      after.alwaysOffUids,
      after.alwaysOnUids.filter((uid) => !before.alwaysOnUids.includes(uid)),
    );
    transaction.set(
      gateRef,
      {
        appId,
        gates: {
          [gateId]: {
            rollout:
              after.rollout === before.rollout
                ? current.rollout
                : after.rollout,
            alwaysOnUids,
            alwaysOffUids,
            updatedAt: Date.now(),
          },
        },
      },
      { merge: true },
    );
  });
}
