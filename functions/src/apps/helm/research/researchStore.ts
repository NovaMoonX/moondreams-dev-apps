import type { Firestore, Transaction } from 'firebase-admin/firestore';

import {
  readUsageDoc,
  toAllowanceMirror,
  type ResearchUsageDoc,
} from '../nomos/planResearch.js';

export const usageRef = (firestore: Firestore, uid: string) =>
  firestore.doc(`apps/helm/server/${uid}/research/usage`);

/** This month's usage, read inside a transaction so a reservation lands on what is there now. */
export const readUsageIn = async (
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  now: number,
  timeZone: string,
): Promise<ResearchUsageDoc> =>
  readUsageDoc(
    (await transaction.get(usageRef(firestore, uid))).data(),
    now,
    timeZone,
  );

/** Writes the usage and the profile's mirror of it together; the mirror is only shown, the usage decides. */
export const writeUsageIn = (
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  usage: ResearchUsageDoc,
  now: number,
  timeZone: string,
  isProfileThere: boolean,
) => {
  transaction.set(usageRef(firestore, uid), usage);
  if (isProfileThere) {
    transaction.update(firestore.doc(`apps/helm/users/${uid}`), {
      researchAllowance: toAllowanceMirror(usage, now, timeZone),
    });
  }
};

const isOpenRerun = (entry: unknown) => {
  const state = entry as Record<string, unknown> | null;
  return (
    state?.kind === 'researchRerun' &&
    (state.answeredAt ?? null) === null &&
    (state.skippedAt ?? null) === null &&
    (state.dismissedAt ?? null) === null
  );
};

/** Whether the person already has a look on the web booked for a later day, or a question offering one still open, so a second offer is never made. */
export const readIsRerunBookedIn = async (
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  exceptId: string | null,
): Promise<boolean> => {
  const base = `apps/helm/users/${uid}`;
  const [booked, open] = await Promise.all([
    transaction.get(
      firestore
        .collection(`${base}/research`)
        .where('rerunOn', '>', 0)
        .limit(5),
    ),
    transaction.get(
      firestore
        .collection(`${base}/captures`)
        .where('status', '==', 'needsYou')
        .limit(100),
    ),
  ]);
  return (
    booked.docs.some(
      (doc) => doc.id !== exceptId && doc.get('status') !== 'dismissed',
    ) ||
    open.docs.some((doc) =>
      Object.values(
        (doc.get('questionState') as Record<string, unknown> | undefined) ?? {},
      ).some(isOpenRerun),
    )
  );
};
