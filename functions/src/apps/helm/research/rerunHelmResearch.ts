import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { unwrapHelmKey } from '../helmKey.js';
import {
  planStart,
  toAllowanceMirror,
  toStartFields,
} from '../nomos/planResearch.js';
import { isResearchRerunDue } from '../nomos/research.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from '../sortHelmCapture.js';
import { readUsageIn, usageRef } from './researchStore.js';
import { STUCK_AFTER_MS, settleResearch } from './runResearch.js';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH = 200;
/** A person's day can be a day ahead of UTC's, so the read reaches that far and each one is judged in its own zone. */
const AHEAD_MS = 36 * 60 * 60_000;
const USER_PATH = /^apps\/helm\/users\/([^/]+)\/research\/([^/]+)$/;

const readOwner = (path: string) => USER_PATH.exec(path);

/** Turns a look from general knowledge into a live quick look on the day the person said yes to, when the month allows it. Reads the item again in the transaction. */
async function rerunOne(
  firestore: Firestore,
  uid: string,
  researchId: string,
  now: number,
) {
  const base = `apps/helm/users/${uid}`;
  const ref = firestore.doc(`${base}/research/${researchId}`);
  return firestore.runTransaction(async (transaction) => {
    const [snap, profileSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(firestore.doc(base)),
    ]);
    const data = snap.data();
    const timeZone = String(profileSnap.get('timeZone') ?? 'UTC');
    if (
      !data ||
      (data.status !== 'ready' && data.status !== 'done') ||
      data.isWithoutWeb !== true ||
      typeof data.rerunOn !== 'number' ||
      !isResearchRerunDue(data.rerunOn, now, timeZone)
    ) {
      return false;
    }
    const usage = await readUsageIn(transaction, firestore, uid, now, timeZone);
    const start = planStart({
      id: researchId,
      wanted: 'light',
      usage,
      now,
      timeZone,
    });
    if (start.isWithoutWeb) return false;
    transaction.update(ref, {
      ...toStartFields(start, now),
      rerunOn: null,
      startedAt: null,
      preparedAt: null,
      cancelledAt: null,
    });
    transaction.set(usageRef(firestore, uid), start.usage);
    if (profileSnap.exists) {
      transaction.update(firestore.doc(base), {
        researchAllowance: toAllowanceMirror(start.usage, now, timeZone),
      });
    }
    return true;
  });
}

/** Gives up an item whose run took the claim and never settled, so what it held comes back. */
async function sweepOne(
  firestore: Firestore,
  keyring: ReturnType<typeof loadKeyringOrFail>,
  uid: string,
  researchId: string,
  now: number,
) {
  const key = await unwrapHelmKey(firestore, keyring, uid).catch(() => null);
  if (!key) return;
  await settleResearch(
    firestore,
    key,
    uid,
    researchId,
    { result: null, spentCents: 0, searches: 0, hundredths: 0 },
    now,
  );
}

export const rerunHelmResearch = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 300,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  async () => {
    const firestore = getFirestore();
    const now = Date.now();
    const due = await firestore
      .collectionGroup('research')
      .where('rerunOn', '<=', now + AHEAD_MS)
      .limit(BATCH)
      .get();
    const reruns = await Promise.all(
      due.docs.flatMap((doc) => {
        const owner = readOwner(doc.ref.path);
        return owner ? [rerunOne(firestore, owner[1], owner[2], now)] : [];
      }),
    );
    const preparing = await firestore
      .collectionGroup('research')
      .where('status', '==', 'preparing')
      .limit(BATCH)
      .get();
    const stuck = preparing.docs.flatMap((doc) => {
      const owner = readOwner(doc.ref.path);
      const startedAt = doc.get('startedAt');
      return owner &&
        typeof startedAt === 'number' &&
        now - startedAt > STUCK_AFTER_MS
        ? [{ uid: owner[1], id: owner[2] }]
        : [];
    });
    if (stuck.length > 0) {
      const keyring = loadKeyringOrFail();
      await Promise.all(
        stuck.map((item) =>
          sweepOne(firestore, keyring, item.uid, item.id, now),
        ),
      );
    }
    logger.info('helm.research.rerun', {
      started: reruns.filter(Boolean).length,
      abandoned: stuck.length,
    });
  },
);
