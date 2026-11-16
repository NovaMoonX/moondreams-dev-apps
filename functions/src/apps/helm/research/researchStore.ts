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
