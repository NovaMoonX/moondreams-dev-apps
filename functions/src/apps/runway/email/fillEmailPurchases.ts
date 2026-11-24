import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import { markClosedMonths } from '../link/syncRunwayLink.js';
import { findMerchants } from '../merchantNames.js';
import {
  planEmailPurchaseFill,
  type EmailPurchaseView,
} from './fillEmailPurchasesPlan.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from '../planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

const PURCHASES_PER_PLAN = 300;
const PARALLEL_PLANS = 10;

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

async function fillPlan(
  firestore: Firestore,
  planKey: PlanKey,
  uid: string,
  from: number,
  now: number,
) {
  const found = await firestore
    .collection(`apps/runway/plans/${uid}/purchases`)
    .where('source', '==', 'email')
    .where('date', '>=', from)
    .orderBy('date', 'desc')
    .limit(PURCHASES_PER_PLAN)
    .get();
  if (found.size === PURCHASES_PER_PLAN) {
    logger.warn('runway.emailFill.capped', { cap: PURCHASES_PER_PLAN });
  }
  const views = found.docs.flatMap((doc) => {
    const data = doc.data();
    if (typeof data.date !== 'number') return [];
    try {
      return [
        {
          doc,
          view: {
            needsHome: data.needsHome === true,
            createdAt: Number(data.createdAt),
            updatedAt: Number(data.updatedAt),
            merchantCheckedAt:
              typeof data.merchantCheckedAt === 'number'
                ? data.merchantCheckedAt
                : null,
            payload: openWithKey(planKey.key, data.sealed as SealedPayload),
          } satisfies EmailPurchaseView,
        },
      ];
    } catch {
      return [];
    }
  });
  const list = await findMerchants(
    firestore,
    views.map(({ view }) =>
      typeof view.payload.merchant === 'string' ? view.payload.merchant : null,
    ),
  );
  if (list === null) return { checked: 0, written: 0 };
  const writes = views.flatMap(({ doc, view }) => {
    const text =
      typeof view.payload.merchant === 'string' ? view.payload.merchant : null;
    const plan = planEmailPurchaseFill(
      view,
      text === null ? null : (list.get(text) ?? null),
      now,
    );
    return plan === null ? [] : [{ doc, view, plan }];
  });
  const results = await Promise.all(
    writes.map(({ doc, view, plan }) =>
      doc.ref
        .update(
          {
            merchantCheckedAt: now,
            ...(plan.needsHome ? { needsHome: true } : {}),
            ...(plan.patch === null && plan.needsHome === null
              ? {}
              : {
                  updatedAt: Math.max(now, view.updatedAt + 1),
                }),
            ...(plan.patch === null
              ? {}
              : {
                  sealed: sealWithKey(
                    planKey,
                    { ...view.payload, ...plan.patch },
                    SEALED_SCHEMA_VERSION,
                  ),
                }),
          },
          { lastUpdateTime: doc.updateTime },
        )
        .then(() => true)
        .catch(() => false),
    ),
  );
  const movedDates = writes.flatMap(({ doc, plan }, index) =>
    results[index] && plan.needsHome ? [Number(doc.get('date'))] : [],
  );
  if (movedDates.length > 0) {
    await markClosedMonths(firestore, uid, movedDates, now);
  }
  return {
    checked: views.length,
    written: results.filter(Boolean).length,
  };
}

/** Brings emailed purchases made before the shared merchant list or the Needs a home rule into line, newest first in a capped read per plan, retrying a miss only weekly. A closed month whose purchase moves into Needs a home is marked for a fresh closing. */
export const fillRunwayEmailPurchases = onSchedule(
  {
    region: 'us-central1',
    schedule: '30 4 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    const now = Date.now();
    const firestore = getFirestore();
    const keyring = loadKeyring();
    const plans = (
      await firestore
        .collection('apps/runway/plans')
        .select('trackingPeriods')
        .get()
    ).docs.flatMap((plan) => {
      const open = (
        plan.data().trackingPeriods as
          { from: number; to: number | null }[] | undefined
      )?.at(-1);
      return open !== undefined && open.to === null
        ? [{ uid: plan.id, from: open.from }]
        : [];
    });
    const chunks = Array.from(
      { length: Math.ceil(plans.length / PARALLEL_PLANS) },
      (_, index) =>
        plans.slice(index * PARALLEL_PLANS, (index + 1) * PARALLEL_PLANS),
    );
    const totals = await chunks.reduce(
      async (done, chunk) => {
        const sum = await done;
        const results = await Promise.all(
          chunk.map(async ({ uid, from }) => {
            try {
              const planKey = await unwrapPlanKey(firestore, keyring, uid);
              return await fillPlan(firestore, planKey, uid, from, now);
            } catch {
              logger.warn('runway.emailFill.planFailed');
              return { checked: 0, written: 0 };
            }
          }),
        );
        return {
          checked: sum.checked + results.reduce((n, r) => n + r.checked, 0),
          written: sum.written + results.reduce((n, r) => n + r.written, 0),
        };
      },
      Promise.resolve({ checked: 0, written: 0 }),
    );
    logger.info('runway.emailFill.done', { plans: plans.length, ...totals });
  },
);
