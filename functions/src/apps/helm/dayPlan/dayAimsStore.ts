import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import { openForHelm, sealForHelm, type HelmKey } from '../helmKey.js';
import { readAimsView, type AimsView } from './dayJob.js';

export const dayQueuePath = (uid: string) => `apps/helm/dayQueue/${uid}`;
export const dayAimsPath = (uid: string, dayKey: string) =>
  `apps/helm/users/${uid}/dayAims/${dayKey}`;

/** Asks for a pass over this person's day soon. The stamp lets a running pass see that something changed while it worked. */
export const stampDayQueue = (firestore: Firestore, uid: string, now: number) =>
  firestore
    .doc(dayQueuePath(uid))
    .set({ lookAt: now, changedAt: now }, { merge: true });

/** The aims view of a stored day, or an empty one when its words do not open. */
export const openAimsView = (key: HelmKey, data: DocumentData | undefined) => {
  try {
    return data?.sealed
      ? readAimsView(openForHelm(key, data.sealed as SealedPayload))
      : readAimsView(null);
  } catch {
    return readAimsView(null);
  }
};

/** Seals a day's aims with the wind-down results kept as they were. */
export const sealAimsView = (key: HelmKey, view: AimsView) =>
  sealForHelm(key, { aims: view.aims, windDown: view.windDown });

/** Whether the person has a day with aims from today on; the calendar sync stamps the queue only for these people. */
export async function hasAimsFrom(
  firestore: Firestore,
  uid: string,
  todayKey: string,
): Promise<boolean> {
  const snap = await firestore
    .collection(`apps/helm/users/${uid}/dayAims`)
    .where('date', '>=', dayKeyToMs(todayKey))
    .limit(1)
    .get();
  return !snap.empty;
}
