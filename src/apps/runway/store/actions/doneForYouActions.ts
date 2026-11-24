import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { DAY_MS } from '@apps/runway/engine/dates';
import {
  DONE_FOR_YOU_DAYS,
  MAX_DONE_FOR_YOU_PRUNE,
} from '@apps/runway/constants';
import { sealJson } from '@apps/runway/security';
import type {
  DoneForYouDoc,
  DoneForYouKind,
  DoneForYouSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const listRef = (uid: string) =>
  collection(db, 'apps', 'runway', 'plans', uid, 'doneForYou');

export interface DoneForYouInput extends DoneForYouSealed {
  kind: DoneForYouKind;
}

/** Records what the app did on its own, one entry each. */
export async function recordDoneForYou(
  uid: string,
  encryption: RunwayEncryption,
  entries: readonly DoneForYouInput[],
): Promise<void> {
  if (entries.length === 0) return;
  const now = Date.now();
  const docs = await Promise.all(
    entries.map(
      async ({ kind, ...sealed }) =>
        ({
          id: generateUuid(),
          kind,
          createdAt: now,
          undoneAt: null,
          sealed: await sealJson(sealed satisfies DoneForYouSealed, encryption),
        }) satisfies DoneForYouDoc,
    ),
  );
  const batch = writeBatch(db);
  docs.forEach((entry) => batch.set(doc(listRef(uid), entry.id), entry));
  await batch.commit();
}

/** Marks an entry undone, touching nothing else in it. */
export async function markDoneForYouUndone(uid: string, id: string) {
  await updateDoc(doc(listRef(uid), id), { undoneAt: Date.now() });
}

/** Stamps the plan with when the person last opened the list, touching no other plan field. */
export async function setDoneForYouSeen(uid: string) {
  await updateDoc(doc(db, 'apps', 'runway', 'plans', uid), {
    doneForYouSeenAt: Date.now(),
  });
}

/** Removes entries past their 30 days, at most 100; best effort. */
export async function pruneDoneForYou(uid: string) {
  try {
    const old = await getDocs(
      query(
        listRef(uid),
        where('createdAt', '<', Date.now() - DONE_FOR_YOU_DAYS * DAY_MS),
        limit(MAX_DONE_FOR_YOU_PRUNE),
      ),
    );
    if (old.empty) return;
    const batch = writeBatch(db);
    old.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  } catch (error) {
    console.error('Old Done for you entries were not removed', error);
  }
}
