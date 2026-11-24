// Run against the Firestore emulator: `npm run check:runway-sort-server`. The server's rework places the waiting posted charges a rule fits, once, with the Done for you entry the phone would write.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { getRuleEntryId } from '../../src/apps/runway/engine/doneText.ts';
import { reworkPlan } from '../../functions/src/apps/runway/figures/reworkPlan.ts';
import { SEALED_SCHEMA_VERSION } from '../../functions/src/apps/runway/link/linkShared.ts';
import {
  DEV_KEYRING,
  deriveSeedDataKey,
  openWithKey,
  sealWithKey,
  wrapDataKey,
  wrappedKeyPath,
} from '../../functions/src/apps/runway/planKey.ts';
import type {
  DoneForYouSealed,
  PurchaseDoc,
  PurchaseSealed,
} from '../../functions/src/apps/runway/runwayTypes.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
if (getApps().length === 0) initializeApp({ projectId: 'demo-runway-sort' });
const firestore = getFirestore();

const DAY_MS = 86_400_000;
const uid = 'sort-check';
const plan = `apps/runway/plans/${uid}`;
const now = Date.now();
const today = Math.floor(now / DAY_MS) * DAY_MS;
const startDate = today - 10 * DAY_MS;
const envelope = 'env-groceries';
const everyday = 'env-everyday';

const data = { ...deriveSeedDataKey(DEV_KEYRING, uid), keyVersion: 1 };
const seal = (fields: object) =>
  sealWithKey(data, { ...fields }, SEALED_SCHEMA_VERSION);
const open = <T>(sealed: unknown) =>
  openWithKey(data.key, sealed as Parameters<typeof openWithKey>[1]) as T;

const purchaseDoc = (
  id: string,
  status: 'pending' | 'posted',
  isPlaced: boolean,
  merchant = 'Safeway',
  {
    date = today - DAY_MS,
    ...extra
  }: Partial<PurchaseSealed> & { date?: number } = {},
): PurchaseDoc => ({
  id,
  date,
  source: 'link',
  status,
  needsHome: !isPlaced,
  accountId: null,
  expenseId: null,
  dedupeKey: `${id}-dedupe`,
  emailEventId: null,
  emailWaiting: null,
  createdAt: date + 3_600_000,
  updatedAt: date + 3_600_000,
  sealed: seal({
    amountCents: 4_200,
    merchant,
    category: 'FOOD_AND_DRINK_GROCERIES',
    ruleId: null,
    label: null,
    note: null,
    lines: [
      isPlaced
        ? { envelopeId: everyday, cents: 4_200, via: 'chosen' }
        : { envelopeId: null, cents: 4_200, via: 'free' },
    ],
    refundOfId: null,
    paidByCardId: null,
    link: null,
    receiptText: null,
    costRef: null,
    notSameAs: null,
    incomeDayId: null,
    assignedBy: isPlaced ? 'person' : null,
    pairedWithId: null,
    pairKind: null,
    cardPaymentMoveId: null,
    tickedDayKey: null,
    ...extra,
  } satisfies PurchaseSealed),
});

const envelopePayload = (name: string) => ({
  name,
  emoji: null,
  priority: 'must',
  orderIndex: 1,
  groupId: null,
  maxCents: null,
  spillTo: [],
  funding: {
    amount: { kind: 'exact', cents: 15_000 },
    cadence: { kind: 'everyIncomeDay' },
  },
});

const archivedEnvelope = 'env-archived';

/** The same database, except the first transaction is preceded by another device changing the purchase. */
const withChangeBeforeFirstTransaction = (purchasePath: string): Firestore => {
  const isChanged = new Set<string>();
  return new Proxy(firestore, {
    get(target, key) {
      const member: unknown = Reflect.get(target, key);
      if (typeof member !== 'function') return member;
      if (key !== 'runTransaction') return member.bind(target);
      return async (...args: Parameters<Firestore['runTransaction']>) => {
        if (!isChanged.has(purchasePath)) {
          isChanged.add(purchasePath);
          const stamp = (await raw(purchasePath)).updatedAt as number;
          await firestore.doc(purchasePath).update({ updatedAt: stamp + 5 });
        }
        return target.runTransaction(...args);
      };
    },
  });
};

async function seed() {
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, data, now));
  await firestore.doc(plan).set({
    uid,
    createdAt: startDate,
    updatedAt: startDate,
    stance: 'conservative',
    startDate,
    trackingPeriods: [{ from: startDate, to: null, linkedFrom: startDate }],
    dirtyFrom: null,
    notify: { needsHome: false },
    sorting: null,
    keyId: data.keyId,
    sealed: seal({ currencyCode: 'USD' }),
  });
  await Promise.all(
    [
      [envelope, 'Groceries'],
      [everyday, 'Everyday spending'],
    ].map(async ([id, name]) => {
      await firestore.doc(`${plan}/items/${id}`).set({
        id,
        kind: 'envelope',
        parentId: null,
        createdAt: startDate,
        endedAt: null,
        archivedAt: null,
        heldReleasedOn: null,
      });
      await firestore.doc(`${plan}/versions/version-${id}`).set({
        id: `version-${id}`,
        itemId: id,
        kind: 'envelope',
        createdAt: startDate,
        effectiveFrom: startDate,
        effectiveUntil: null,
        changeId: `change-${id}`,
        sealed: seal(envelopePayload(name)),
      });
      await firestore.doc(`${plan}/moves/start_${id}`).set({
        id: `start_${id}`,
        kind: 'start',
        date: startDate,
        refId: id,
        reversesMoveId: null,
        createdAt: startDate,
        sealed: seal({ amountCents: 40_000, holding: 'envelope' }),
      });
    }),
  );
  await firestore.doc(`${plan}/rules/rule-safeway`).set({
    id: 'rule-safeway',
    createdAt: startDate,
    updatedAt: startDate,
    sealed: seal({
      merchantKey: 'safeway',
      merchantName: 'Safeway',
      category: null,
      cardId: null,
      target: envelope,
    }),
  });
  await Promise.all(
    [
      purchaseDoc('waiting-posted', 'posted', false),
      purchaseDoc('waiting-pending', 'pending', false),
      purchaseDoc('placed-by-hand', 'posted', true),
      purchaseDoc('waiting-other-store', 'posted', false, 'Corner Hardware'),
    ].map((doc) => firestore.doc(`${plan}/purchases/${doc.id}`).set(doc)),
  );
}

const raw = async (path: string) =>
  (await firestore.doc(path).get()).data() as Record<string, unknown>;

async function main() {
  await seed();
  const before = {
    pending: await raw(`${plan}/purchases/waiting-pending`),
    byHand: await raw(`${plan}/purchases/placed-by-hand`),
    other: await raw(`${plan}/purchases/waiting-other-store`),
  };
  const prevUpdatedAt = (await raw(`${plan}/purchases/waiting-posted`))
    .updatedAt as number;

  const first = await reworkPlan(firestore, DEV_KEYRING, uid, now);
  assert.equal(first.kind, 'done');

  const placed = (await raw(
    `${plan}/purchases/waiting-posted`,
  )) as unknown as PurchaseDoc;
  assert.equal(placed.needsHome, false, 'the posted charge left Needs a home');
  assert.ok(placed.updatedAt >= prevUpdatedAt + 1);
  const placedSealed = open<PurchaseSealed>(placed.sealed);
  assert.equal(placedSealed.assignedBy, 'auto');
  assert.equal(placedSealed.ruleId, 'rule-safeway');
  assert.deepEqual(placedSealed.lines, [
    { envelopeId: envelope, cents: 4_200, via: 'chosen' },
  ]);

  assert.deepEqual(
    await raw(`${plan}/purchases/waiting-pending`),
    before.pending,
    'a pending charge is left for the bank to post',
  );
  assert.deepEqual(
    await raw(`${plan}/purchases/placed-by-hand`),
    before.byHand,
    'a charge the person placed is untouched',
  );
  assert.deepEqual(
    await raw(`${plan}/purchases/waiting-other-store`),
    before.other,
    'a charge no rule fits is untouched',
  );

  const entries = await firestore.collection(`${plan}/doneForYou`).get();
  assert.equal(entries.size, 1, 'one placement is one Done for you entry');
  const [entry] = entries.docs;
  assert.equal(
    entry.id,
    getRuleEntryId({ id: 'waiting-posted', updatedAt: prevUpdatedAt }),
  );
  assert.equal(entry.get('kind'), 'rule');
  assert.equal(entry.get('undoneAt'), null);
  const sealed = open<DoneForYouSealed>(entry.get('sealed'));
  assert.equal(sealed.title, 'Safeway went to Groceries');
  assert.equal(sealed.why, 'Your rule, Safeway goes to Groceries');
  assert.equal(sealed.subject?.purchaseId, 'waiting-posted');
  assert.equal(sealed.subject?.toName, 'Groceries');
  assert.equal(sealed.undo?.kind, 'rule');
  const undo = sealed.undo as Extract<
    NonNullable<DoneForYouSealed['undo']>,
    { kind: 'rule' }
  >;
  assert.equal(
    undo.placed.updatedAt,
    placed.updatedAt,
    'the Undo expects the exact stamp written',
  );
  assert.equal(undo.placed.assignedBy, 'auto');
  assert.equal(undo.placed.needsHome, false);

  const changes = await firestore.collection(`${plan}/changes`).get();
  assert.equal(changes.size, 1, 'one change-log entry');
  assert.match(
    open<{ summary: string }>(changes.docs[0].get('sealed')).summary,
    /^Purchase sent to Groceries: Safeway, \$42\.00 on .+\. By your rule “Safeway goes to Groceries”\.$/,
  );

  const figures = await raw(`${plan}/figures/current`);
  assert.equal(figures.id, 'current', 'figures are written after the sort');

  const second = await reworkPlan(firestore, DEV_KEYRING, uid, now + 1_000);
  assert.equal(second.kind, 'done');
  assert.equal(
    (await firestore.collection(`${plan}/doneForYou`).get()).size,
    1,
  );
  assert.equal((await firestore.collection(`${plan}/changes`).get()).size, 1);
  assert.equal(
    ((await raw(`${plan}/purchases/waiting-posted`)) as { updatedAt: number })
      .updatedAt,
    placed.updatedAt,
    'a second run places nothing',
  );

  const planBefore = await raw(plan);
  const doneBefore = (await firestore.collection(`${plan}/doneForYou`).get())
    .size;
  const monthsAgo = new Date(today);
  const closedDate = Date.UTC(
    monthsAgo.getUTCFullYear(),
    monthsAgo.getUTCMonth() - 3,
    15,
  );
  await firestore.doc(`${plan}/items/${archivedEnvelope}`).set({
    id: archivedEnvelope,
    kind: 'envelope',
    parentId: null,
    createdAt: startDate,
    endedAt: null,
    archivedAt: startDate + DAY_MS,
    heldReleasedOn: null,
  });
  await firestore.doc(`${plan}/versions/version-${archivedEnvelope}`).set({
    id: `version-${archivedEnvelope}`,
    itemId: archivedEnvelope,
    kind: 'envelope',
    createdAt: startDate,
    effectiveFrom: startDate,
    effectiveUntil: null,
    changeId: `change-${archivedEnvelope}`,
    sealed: seal(envelopePayload('Old envelope')),
  });
  await firestore.doc(`${plan}/rules/rule-old-store`).set({
    id: 'rule-old-store',
    createdAt: startDate,
    updatedAt: startDate,
    sealed: seal({
      merchantKey: 'old store',
      merchantName: 'Old Store',
      category: null,
      cardId: null,
      target: archivedEnvelope,
    }),
  });
  const scenarios = [
    purchaseDoc('waiting-closed', 'posted', false, 'Safeway', {
      date: closedDate,
    }),
    purchaseDoc('waiting-archived', 'posted', false, 'Old Store'),
    purchaseDoc('waiting-bill', 'posted', false, 'Safeway', {
      billRef: { billId: 'bill-x', dueOn: today, moveId: 'move-x' },
    }),
  ];
  await Promise.all(
    scenarios.map((doc) =>
      firestore.doc(`${plan}/purchases/${doc.id}`).set(doc),
    ),
  );
  const scenarioBefore = await Promise.all(
    scenarios.map(({ id }) => raw(`${plan}/purchases/${id}`)),
  );

  const third = await reworkPlan(firestore, DEV_KEYRING, uid, now + 2_000);
  assert.equal(third.kind, 'done');
  const scenarioAfter = await Promise.all(
    scenarios.map(({ id }) => raw(`${plan}/purchases/${id}`)),
  );
  assert.deepEqual(
    scenarioAfter,
    scenarioBefore,
    'a charge in a closed month, into an archived envelope or tied to a bill is left alone',
  );
  const planAfter = await raw(plan);
  assert.equal(planAfter.dirtyFrom, planBefore.dirtyFrom, 'no month is marked');
  assert.equal(planAfter.updatedAt, planBefore.updatedAt);
  assert.equal(
    (await firestore.collection(`${plan}/doneForYou`).get()).size,
    doneBefore,
    'nothing skipped is recorded in Done for you',
  );
  assert.equal(
    (await raw(`${plan}/figures/current`)).id,
    'current',
    'the figures are still written when a charge is left waiting',
  );

  const stalePath = `${plan}/purchases/waiting-stale`;
  await firestore
    .doc(stalePath)
    .set(purchaseDoc('waiting-stale', 'posted', false));
  const changesBefore = (await firestore.collection(`${plan}/changes`).get())
    .size;
  const fourth = await reworkPlan(
    withChangeBeforeFirstTransaction(stalePath),
    DEV_KEYRING,
    uid,
    now + 3_000,
  );
  assert.equal(fourth.kind, 'done');
  const stale = (await raw(stalePath)) as unknown as PurchaseDoc;
  assert.equal(
    stale.needsHome,
    true,
    'a purchase changed after it was read is not placed',
  );
  assert.equal(
    (await firestore.collection(`${plan}/changes`).get()).size,
    changesBefore,
  );
  assert.equal(
    (await firestore.collection(`${plan}/doneForYou`).get()).size,
    doneBefore,
  );
  console.log('Runway server sorting: all checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
