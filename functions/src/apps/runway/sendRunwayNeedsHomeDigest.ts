import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { isGateOpenForUid } from '../../gates/assertGateOpen.js';
import { sendPushReport, toAppUrl } from '../../notifications/sendPush.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  claimPath,
  countWaiting,
  getDigestDay,
  readDigestSettings,
  readSorting,
  withoutEmailTwins,
  type SortingState,
} from './needsHomeDigestPlan.js';
import {
  NEEDS_HOME_PATH,
  needsHomeBody,
  RUNWAY_PUSH_TITLE,
} from './notificationText.js';
import {
  openWithKey,
  unwrapPlanKey,
  type Keyring,
  type SealedPayload,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const ALREADY_EXISTS = 6;
const BATCH_SIZE = 20;

const isSealed = (value: unknown): value is SealedPayload =>
  typeof value === 'object' && value !== null && 'value' in value;

/** A purchase's sealed fields the digest needs; 0 cents when it can't be opened, so a bad document counts as waiting instead of sinking the plan's digest. */
const readPurchase = (key: Buffer, payload: unknown) => {
  const none = {
    amountCents: 0,
    paidByCardId: null,
    notSameAs: [] as string[],
    pairedWithId: null,
  };
  if (!isSealed(payload)) return none;
  try {
    const opened = openWithKey(key, payload);
    return {
      amountCents:
        typeof opened.amountCents === 'number' ? opened.amountCents : 0,
      paidByCardId:
        typeof opened.paidByCardId === 'string' ? opened.paidByCardId : null,
      notSameAs: Array.isArray(opened.notSameAs)
        ? opened.notSameAs.filter((id): id is string => typeof id === 'string')
        : [],
      pairedWithId:
        typeof opened.pairedWithId === 'string' ? opened.pairedWithId : null,
    };
  } catch {
    return none;
  }
};

/** Creates the day's claim; false when it already exists, so a rerun never sends twice. */
const claimDay = (
  firestore: Firestore,
  uid: string,
  date: string,
  now: number,
) =>
  firestore
    .doc(claimPath(uid, date))
    .create({ kind: 'needsHome', claimedAt: now })
    .then(() => true)
    .catch((error: { code?: unknown }) => {
      if (error.code === ALREADY_EXISTS) return false;
      throw error;
    });

type Outcome =
  'sent' | 'notHour' | 'empty' | 'claimed' | 'closed' | 'dropped' | 'failed';

async function digestForPlan(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  sealed: unknown,
  sorting: SortingState | null,
  now: number,
): Promise<Outcome> {
  const planKey = await unwrapPlanKey(firestore, keyring, uid);
  const settings = readDigestSettings(
    isSealed(sealed) ? openWithKey(planKey.key, sealed) : {},
  );
  const date = getDigestDay(now, settings);
  if (!date) return 'notHour';
  const claim = firestore.doc(claimPath(uid, date));
  if ((await claim.get()).exists) return 'claimed';
  const waitingPurchases = firestore
    .collection(`apps/runway/plans/${uid}/purchases`)
    .where('needsHome', '==', true);
  const rows = (
    await waitingPurchases
      .select(
        'createdAt',
        'date',
        'status',
        'source',
        'accountId',
        'emailWaiting',
        'sealed',
      )
      .get()
  ).docs.map((purchase) => {
    const data = purchase.data();
    const created = typeof data.createdAt === 'number' ? data.createdAt : now;
    return {
      id: purchase.id,
      createdAt: created,
      date: typeof data.date === 'number' ? data.date : created,
      isPending: data.status === 'pending',
      source: typeof data.source === 'string' ? data.source : null,
      accountId: typeof data.accountId === 'string' ? data.accountId : null,
      emailWaiting: data.emailWaiting === true,
      ...readPurchase(planKey.key, data.sealed),
    };
  });
  const waiting = countWaiting(withoutEmailTwins(rows), sorting);
  if (waiting === 0) return 'empty';
  if (!(await isGateOpenForUid(uid, 'runway', 'link-banks', 'off'))) {
    return 'closed';
  }
  const url = toAppUrl(NEEDS_HOME_PATH);
  if (!url) return 'dropped';
  if (!(await claimDay(firestore, uid, date, now))) return 'claimed';
  // The person chose this hour, so the budget for pushes nobody asked for does not apply.
  const report = await sendPushReport(firestore, getMessaging(), [uid], {
    title: RUNWAY_PUSH_TITLE,
    body: needsHomeBody(waiting),
    url,
  }).catch(async (error: unknown) => {
    await claim.delete().catch(() => undefined);
    throw error;
  });
  if (report.isFailure) {
    await claim.delete();
    return 'failed';
  }
  return report.devices > 0 ? 'sent' : 'dropped';
}

export const sendRunwayNeedsHomeDigest = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 30 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 300,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    const now = Date.now();
    const firestore = getFirestore();
    const keyring = loadKeyring();
    const plans = await firestore
      .collection('apps/runway/plans')
      .where('notify.needsHome', '==', true)
      .select('sealed', 'sorting')
      .get();
    const batches = Array.from(
      { length: Math.ceil(plans.size / BATCH_SIZE) },
      (_, index) =>
        plans.docs.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
    );
    const outcomes = await batches.reduce<Promise<Outcome[]>>(
      async (done, batch) => [
        ...(await done),
        ...(await Promise.all(
          batch.map((plan) =>
            digestForPlan(
              firestore,
              keyring,
              plan.id,
              plan.data().sealed,
              readSorting(plan.data().sorting),
              now,
            ).catch((error: { code?: unknown }): Outcome => {
              logger.warn('runway.needsHomeDigest.failed', {
                uid: plan.id,
                code: typeof error?.code === 'string' ? error.code : null,
              });
              return 'failed';
            }),
          ),
        )),
      ],
      Promise.resolve([]),
    );
    logger.info('runway.needsHomeDigest.done', {
      plans: plans.size,
      ...Object.fromEntries(
        [...new Set(outcomes)].map((outcome) => [
          outcome,
          outcomes.filter((entry) => entry === outcome).length,
        ]),
      ),
    });
  },
);
