// Run against the Firestore emulator: `npm run check:runway-alerts-server`. After a rework the server judges the person's alerts, sends one push when one goes off, and holds one that goes off in quiet hours until 08:00 local. When closings are stale or behind, the run rebuilds them itself and still writes figures and judges alerts.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore';

import { reworkPlan } from '../../functions/src/apps/runway/figures/reworkPlan.ts';
import {
  rebuildClosingsOnServer,
  SERVER_REBUILD_MONTHS,
} from '../../functions/src/apps/runway/figures/rebuildClosings.ts';
import {
  decodeClosing,
  encodeClosing,
  getLastClosableMonth,
  getMonthStart,
  getNextMonth,
  listMonths,
  toMonthKey,
} from '../../functions/src/apps/runway/engine/closings.ts';
import {
  buildClosings as buildOnPhone,
  encodeClosing as encodeOnPhone,
  getMonthStart as phoneMonthStart,
  getNextMonth as phoneNextMonth,
} from '../../src/apps/runway/engine/closings.ts';
import { openMonthEntries as openOnPhone } from '../../src/apps/runway/store/listeners/openLedger.ts';
import type { SendAlertPush } from '../../functions/src/apps/runway/figures/alerts.ts';
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
  AlertDoc,
  AlertSealed,
  AlertStateDoc,
  BillPaidSealed,
  CardPaymentSealed,
  ClosingSealed,
  ConfirmedSealed,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  PurchaseDoc,
  PurchaseSealed,
} from '../../functions/src/apps/runway/runwayTypes.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
if (getApps().length === 0) initializeApp({ projectId: 'demo-runway-alerts' });
const firestore = getFirestore();

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
const startDate = today - 10 * DAY_MS;
const groceries = 'env-groceries';
const everyday = 'env-everyday';
// All runs are on this UTC day or the next, so a figure only moves when the check moves it.
const at = (hours: number) => today + hours * HOUR_MS;

const planOf = (uid: string) => `apps/runway/plans/${uid}`;
const data = (uid: string) => ({
  ...deriveSeedDataKey(DEV_KEYRING, uid),
  keyVersion: 1,
});
const seal = (uid: string, fields: object) =>
  sealWithKey(data(uid), { ...fields }, SEALED_SCHEMA_VERSION);

const purchase = (
  uid: string,
  id: string,
  cents: number,
  date = today - DAY_MS,
): PurchaseDoc => ({
  id,
  date,
  source: 'manual',
  status: 'posted',
  needsHome: false,
  accountId: null,
  expenseId: null,
  dedupeKey: null,
  emailEventId: null,
  emailWaiting: null,
  emailWaitUntil: null,
  wasPending: false,
  createdAt: today - DAY_MS + HOUR_MS,
  updatedAt: today - DAY_MS + HOUR_MS,
  sealed: seal(uid, {
    amountCents: cents,
    merchant: 'Safeway',
    category: null,
    ruleId: null,
    label: null,
    note: null,
    lines: [{ envelopeId: groceries, cents, via: 'chosen' }],
    refundOfId: null,
    paidByCardId: null,
    link: null,
    receiptText: null,
    costRef: null,
    notSameAs: null,
    incomeDayId: null,
    assignedBy: 'person',
    pairedWithId: null,
    pairKind: null,
    cardPaymentMoveId: null,
    tickedDayKey: null,
  } satisfies PurchaseSealed),
});

async function seedPlan(uid: string, isTracking: boolean, start = startDate) {
  const plan = planOf(uid);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, data(uid), at(0)));
  await firestore.doc(plan).set({
    uid,
    createdAt: start,
    updatedAt: start,
    stance: 'conservative',
    startDate: start,
    trackingPeriods: isTracking
      ? [{ from: start, to: null, linkedFrom: start }]
      : [],
    dirtyFrom: null,
    notify: { needsHome: false },
    sorting: null,
    keyId: data(uid).keyId,
    sealed: seal(uid, { currencyCode: 'USD' }),
  });
  await Promise.all(
    [
      [groceries, 'Groceries'],
      [everyday, 'Everyday spending'],
    ].map(async ([id, name]) => {
      await firestore.doc(`${plan}/items/${id}`).set({
        id,
        kind: 'envelope',
        parentId: null,
        createdAt: start,
        endedAt: null,
        archivedAt: null,
        heldReleasedOn: null,
      });
      await firestore.doc(`${plan}/versions/version-${id}`).set({
        id: `version-${id}`,
        itemId: id,
        kind: 'envelope',
        createdAt: start,
        effectiveFrom: start,
        effectiveUntil: null,
        changeId: `change-${id}`,
        sealed: seal(uid, {
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
        }),
      });
      await firestore.doc(`${plan}/moves/start_${id}`).set({
        id: `start_${id}`,
        kind: 'start',
        date: start,
        refId: id,
        reversesMoveId: null,
        createdAt: start,
        sealed: seal(uid, { amountCents: 40_000, holding: 'envelope' }),
      });
    }),
  );
}

const putAlert = (
  uid: string,
  id: string,
  fields: Partial<AlertSealed> = {},
) => {
  const doc: AlertDoc = {
    id,
    createdAt: at(0),
    updatedAt: at(0),
    sealed: seal(uid, {
      target: { kind: 'envelope', itemId: groceries },
      line: { kind: 'cents', cents: 10_000 },
      isNamed: false,
      ...fields,
    } satisfies AlertSealed),
  };
  return firestore.doc(`${planOf(uid)}/alerts/${id}`).set(doc);
};

const spend = (uid: string, cents: number) =>
  firestore
    .doc(`${planOf(uid)}/purchases/spent`)
    .set(purchase(uid, 'spent', cents));
const unspend = (uid: string) =>
  firestore.doc(`${planOf(uid)}/purchases/spent`).delete();
const stateOf = async (uid: string, id: string) =>
  (await firestore.doc(`${planOf(uid)}/alertStates/${id}`).get()).data() as
    AlertStateDoc | undefined;

const outbox = () => {
  const sent: { body: string; url: string }[] = [];
  const send: SendAlertPush = async (_uids, content) => {
    sent.push({ body: content.body, url: content.url });
    return { devices: 1, isFailure: false };
  };
  return { sent, send };
};

const run = (uid: string, now: number, send: SendAlertPush) =>
  reworkPlan(firestore, DEV_KEYRING, uid, now, send);

const closingsOf = async (uid: string) =>
  (await firestore.collection(`${planOf(uid)}/closings`).get()).docs;

async function main() {
  // A drop outside quiet hours sends one push and leaves nothing held.
  const day = 'alerts-day';
  await seedPlan(day, true);
  await putAlert(day, 'low-groceries');
  const noon = outbox();
  const first = await run(day, at(12), noon.send);
  assert.equal(first.kind, 'done');
  assert.equal(first.kind === 'done' && first.wakeAt, null);
  assert.equal(
    (await stateOf(day, 'low-groceries'))?.isBelow,
    false,
    'a first look records where things stand',
  );
  assert.equal(noon.sent.length, 0);
  await spend(day, 35_000);
  const dropped = await run(day, at(13), noon.send);
  assert.equal(noon.sent.length, 1, 'a drop sends one push');
  assert.equal(
    noon.sent[0].body,
    'An envelope dropped below one of your alerts.',
  );
  assert.equal(
    noon.sent[0].url.endsWith(`/runway?openEnvelope=${groceries}`),
    true,
  );
  assert.equal(dropped.kind === 'done' && dropped.wakeAt, null);
  const sentState = await stateOf(day, 'low-groceries');
  assert.equal(sentState?.isBelow, true);
  assert.equal(sentState?.heldSince, null);
  assert.equal(sentState?.lastFiredAt, at(13));
  await run(day, at(14), noon.send);
  assert.equal(noon.sent.length, 1, 'it does not go off again while below');

  // A drop at 23:00 is held, and the 08:00 run sends it and clears the hold.
  const night = 'alerts-night';
  await seedPlan(night, true);
  await putAlert(night, 'low-groceries');
  const sleepy = outbox();
  await run(night, at(20), sleepy.send);
  await spend(night, 35_000);
  const held = await run(night, at(23), sleepy.send);
  assert.equal(sleepy.sent.length, 0, 'nothing is sent in quiet hours');
  assert.equal((await stateOf(night, 'low-groceries'))?.heldSince, at(23));
  assert.equal(
    held.kind === 'done' && held.wakeAt,
    at(32),
    'a held alert wakes the plan at 08:00 local',
  );
  const stillNight = await run(night, at(26), sleepy.send);
  assert.equal(sleepy.sent.length, 0);
  assert.equal(stillNight.kind === 'done' && stillNight.wakeAt, at(32));
  assert.equal((await stateOf(night, 'low-groceries'))?.heldSince, at(23));
  const morning = await run(night, at(32), sleepy.send);
  assert.equal(sleepy.sent.length, 1, 'the morning run sends the held alert');
  assert.equal(morning.kind === 'done' && morning.wakeAt, null);
  assert.equal((await stateOf(night, 'low-groceries'))?.heldSince, null);
  assert.equal((await stateOf(night, 'low-groceries'))?.isBelow, true);
  await run(night, at(33), sleepy.send);
  assert.equal(sleepy.sent.length, 1, 'a sent alert is not sent again');

  // Recovery before 08:00 drops the held alert.
  const recover = 'alerts-recover';
  await seedPlan(recover, true);
  await putAlert(recover, 'low-groceries');
  const quiet = outbox();
  await run(recover, at(20), quiet.send);
  await spend(recover, 35_000);
  await run(recover, at(23), quiet.send);
  assert.equal((await stateOf(recover, 'low-groceries'))?.heldSince, at(23));
  await unspend(recover);
  const recovered = await run(recover, at(26), quiet.send);
  assert.equal(recovered.kind === 'done' && recovered.wakeAt, null);
  assert.equal((await stateOf(recover, 'low-groceries'))?.heldSince, null);
  await run(recover, at(32), quiet.send);
  assert.equal(quiet.sent.length, 0, 'a recovered alert is never sent');

  // A plan below tracking does nothing.
  const plain = 'alerts-plan';
  await seedPlan(plain, false);
  await putAlert(plain, 'low-groceries');
  const none = outbox();
  const plainRun = await run(plain, at(12), none.send);
  assert.equal(plainRun.kind, 'done');
  assert.equal(plainRun.kind === 'done' && plainRun.wakeAt, null);
  assert.equal(
    (await firestore.collection(`${planOf(plain)}/alertStates`).get()).size,
    0,
  );
  assert.equal(none.sent.length, 0);

  // An alert deleted mid-way removes its state; the other keeps its own.
  const gone = 'alerts-gone';
  await seedPlan(gone, true);
  await putAlert(gone, 'keep');
  await putAlert(gone, 'remove', {
    target: { kind: 'envelope', itemId: everyday },
  });
  const quietBox = outbox();
  await run(gone, at(12), quietBox.send);
  assert.equal(
    (await firestore.collection(`${planOf(gone)}/alertStates`).get()).size,
    2,
  );
  await firestore.doc(`${planOf(gone)}/alerts/remove`).delete();
  await run(gone, at(13), quietBox.send);
  assert.equal(await stateOf(gone, 'remove'), undefined);
  assert.notEqual(await stateOf(gone, 'keep'), undefined);

  // An alert that will not open is skipped and its state left alone.
  await firestore.doc(`${planOf(gone)}/alerts/scrambled`).set({
    id: 'scrambled',
    createdAt: at(0),
    updatedAt: at(0),
    sealed: { value: 'x', nonce: 'n', keyId: 'k', keyVersion: 1 },
  });
  await run(gone, at(14), quietBox.send);
  assert.equal(await stateOf(gone, 'scrambled'), undefined);

  // One that opens to a shape the app never writes, or has no stamp, is skipped too, and the run still finishes.
  await firestore.doc(`${planOf(gone)}/alerts/odd`).set({
    id: 'odd',
    createdAt: at(0),
    updatedAt: at(0),
    sealed: seal(gone, { target: { kind: 'nope' }, line: null }),
  });
  await firestore.doc(`${planOf(gone)}/alerts/unstamped`).set({
    id: 'unstamped',
    createdAt: at(0),
    sealed: seal(gone, {
      target: { kind: 'freeToSpend' },
      line: { kind: 'cents', cents: 10_000 },
      isNamed: false,
    }),
  });
  const odd = await run(gone, at(15), quietBox.send);
  assert.equal(odd.kind, 'done', 'a bad alert never fails the run');
  assert.equal(await stateOf(gone, 'odd'), undefined);
  assert.equal(await stateOf(gone, 'unstamped'), undefined);

  // Deleting the last alert removes what was kept about it.
  await Promise.all(
    ['keep', 'scrambled', 'odd', 'unstamped'].map((id) =>
      firestore.doc(`${planOf(gone)}/alerts/${id}`).delete(),
    ),
  );
  await run(gone, at(16), quietBox.send);
  assert.equal(
    (await firestore.collection(`${planOf(gone)}/alertStates`).get()).size,
    0,
    'no state outlives the last alert',
  );

  // A hold older than a day went off for a moment long past, so it is dropped, not sent.
  const stale = 'alerts-stale';
  await seedPlan(stale, true);
  await putAlert(stale, 'low-groceries');
  const late = outbox();
  await run(stale, at(12), late.send);
  await spend(stale, 35_000);
  await run(stale, at(13), async () => {
    throw new Error('messaging is down');
  });
  assert.equal((await stateOf(stale, 'low-groceries'))?.heldSince, at(13));
  await run(stale, at(38), late.send);
  assert.equal(late.sent.length, 0, 'a day-old hold is not sent');
  assert.equal((await stateOf(stale, 'low-groceries'))?.heldSince, null);
  assert.equal((await stateOf(stale, 'low-groceries'))?.isBelow, true);

  // A failing send keeps the hold so a later run tries again, and a named alert names its envelope.
  const failing = 'alerts-failing';
  await seedPlan(failing, true);
  await putAlert(failing, 'low-groceries', { isNamed: true });
  const working = outbox();
  await run(failing, at(12), working.send);
  await spend(failing, 35_000);
  const attempts: number[] = [];
  const broken: SendAlertPush = async () => {
    attempts.push(1);
    throw new Error('messaging is down');
  };
  const failed = await run(failing, at(13), broken);
  assert.equal(attempts.length, 1);
  assert.equal(
    (await stateOf(failing, 'low-groceries'))?.heldSince,
    at(13),
    'a failed send leaves the hold',
  );
  assert.equal(failed.kind === 'done' && failed.wakeAt, at(32));
  const refused: SendAlertPush = async () => ({ devices: 1, isFailure: true });
  await run(failing, at(14), refused);
  assert.equal((await stateOf(failing, 'low-groceries'))?.heldSince, at(13));
  await run(failing, at(15), working.send);
  assert.equal(working.sent.length, 1, 'a later run sends what was held');
  assert.equal(
    working.sent[0].body,
    'Groceries dropped below one of your alerts.',
  );
  assert.equal((await stateOf(failing, 'low-groceries'))?.heldSince, null);

  // Several at once go in one push that counts them and names nothing.
  const many = 'alerts-many';
  await seedPlan(many, true);
  await putAlert(many, 'a', { isNamed: true });
  await putAlert(many, 'b', { line: { kind: 'share', bps: 5_000 } });
  const together = outbox();
  await run(many, at(12), together.send);
  await spend(many, 35_000);
  await run(many, at(13), together.send);
  assert.equal(together.sent.length, 1);
  assert.equal(together.sent[0].body, '2 of your alerts went off.');
  assert.ok(together.sent[0].url.endsWith('/runway'));

  // An archived envelope's alerts are deleted with their state; another envelope's stay.
  const archived = 'alerts-archived';
  await seedPlan(archived, true);
  await putAlert(archived, 'on-groceries');
  await putAlert(archived, 'on-everyday', {
    target: { kind: 'envelope', itemId: everyday },
  });
  await run(archived, at(12), outbox().send);
  assert.ok(await stateOf(archived, 'on-groceries'));
  await firestore
    .doc(`${planOf(archived)}/items/${groceries}`)
    .update({ archivedAt: today });
  await run(archived, at(13), outbox().send);
  const left = await firestore.collection(`${planOf(archived)}/alerts`).get();
  assert.deepEqual(
    left.docs.map((entry) => entry.id),
    ['on-everyday'],
    'only the archived envelope loses its alerts',
  );
  assert.equal(await stateOf(archived, 'on-groceries'), undefined);
  assert.ok(await stateOf(archived, 'on-everyday'));

  // Raising an envelope's amount moves a share line above the figure; that is not spending, so nothing goes off.
  const raised = 'alerts-raised';
  await seedPlan(raised, true);
  await putAlert(raised, 'half-groceries', {
    line: { kind: 'share', bps: 5_000 },
  });
  await run(raised, at(12), outbox().send);
  assert.equal((await stateOf(raised, 'half-groceries'))?.isBelow, false);
  await firestore.doc(`${planOf(raised)}/versions/version-raised`).set({
    id: 'version-raised',
    itemId: groceries,
    kind: 'envelope',
    createdAt: at(12),
    effectiveFrom: today,
    effectiveUntil: null,
    changeId: 'change-raised',
    sealed: seal(raised, {
      name: 'Groceries',
      emoji: null,
      priority: 'must',
      orderIndex: 1,
      groupId: null,
      maxCents: null,
      spillTo: [],
      funding: {
        amount: { kind: 'exact', cents: 200_000 },
        cadence: { kind: 'everyIncomeDay' },
      },
    }),
  });
  const afterRaise = outbox();
  await run(raised, at(13), afterRaise.send);
  const raisedState = await stateOf(raised, 'half-groceries');
  assert.equal(raisedState?.lineFrom, 'version-raised');
  assert.equal(raisedState?.isBelow, true);
  assert.equal(afterRaise.sent.length, 0, 'a raised amount sends no push');

  // Closings two months behind (none yet, the plan began months ago) are rebuilt by the run itself, then figures and alerts follow.
  const behind = 'alerts-behind';
  const longAgo = today - 120 * DAY_MS;
  const target = getLastClosableMonth(today);
  await seedPlan(behind, true, longAgo);
  await putAlert(behind, 'low-groceries');
  const behindRun = await run(behind, at(12), outbox().send);
  assert.equal(
    behindRun.kind,
    'done',
    'stale closings no longer make the run wait',
  );
  const built = await closingsOf(behind);
  assert.equal(
    built.at(-1)?.id,
    target,
    'closings reach the last closable month',
  );
  assert.equal(built[0]?.id, toMonthKey(longAgo));
  const opened = decodeClosing(
    target,
    openWithKey(
      data(behind).key,
      built.at(-1)?.get('sealed'),
    ) as unknown as ClosingSealed,
  );
  assert.equal(
    opened.startDate,
    longAgo,
    'a server closing opens as the phone reads it',
  );
  const planAfter = (await firestore.doc(planOf(behind)).get()).data();
  assert.equal(planAfter?.dirtyFrom, null);
  const figures = (
    await firestore.doc(`${planOf(behind)}/figures/current`).get()
  ).data();
  assert.ok(figures, 'figures are written in the same run');
  assert.equal(
    figures?.planStamp,
    planAfter?.updatedAt,
    'the figures carry the stamp the rebuild left, so the phone trusts them',
  );
  assert.equal((await stateOf(behind, 'low-groceries'))?.isBelow, false);

  // A charge dated in a closed month marks dirtyFrom; the run rebuilds from there, clears it, and the alert goes off.
  const closedMonth = toMonthKey(longAgo);
  const stamped = planAfter?.updatedAt as number;
  await firestore
    .doc(`${planOf(behind)}/purchases/late`)
    .set(purchase(behind, 'late', 35_000, longAgo + DAY_MS));
  await firestore
    .doc(planOf(behind))
    .update({ dirtyFrom: closedMonth, updatedAt: stamped + 1 });
  const dirty = outbox();
  const dirtyRun = await run(behind, at(13), dirty.send);
  assert.equal(dirtyRun.kind, 'done');
  const cleaned = (await firestore.doc(planOf(behind)).get()).data();
  assert.equal(cleaned?.dirtyFrom, null, 'the rebuild clears dirtyFrom');
  assert.ok((cleaned?.updatedAt as number) > stamped + 1);
  assert.equal(
    (await firestore.doc(`${planOf(behind)}/figures/current`).get()).get(
      'planStamp',
    ),
    cleaned?.updatedAt,
  );
  assert.equal(
    dirty.sent.length,
    1,
    'a charge in a closed month still sets off its alert',
  );
  assert.equal((await stateOf(behind, 'low-groceries'))?.isBelow, true);

  // A plan further back than one run builds goes as far as it may, marks where it stopped and finishes on the next run.
  const ancient = 'alerts-ancient';
  const yearsAgo = today - (SERVER_REBUILD_MONTHS + 6) * 31 * DAY_MS;
  await seedPlan(ancient, true, yearsAgo);
  const firstPart = await run(ancient, at(12), outbox().send);
  assert.equal(firstPart.kind, 'waiting');
  const partial = await closingsOf(ancient);
  assert.equal(partial.length, SERVER_REBUILD_MONTHS);
  assert.equal(
    (await firestore.doc(planOf(ancient)).get()).get('dirtyFrom'),
    getNextMonth(partial[SERVER_REBUILD_MONTHS - 1].id),
    'a partial rebuild leaves dirtyFrom on the month after the last closing it wrote',
  );
  assert.equal(
    (await firestore.doc(`${planOf(ancient)}/figures/current`).get()).exists,
    false,
  );
  const secondPart = await run(ancient, at(12) + 60_000, outbox().send);
  assert.equal(secondPart.kind, 'done');
  assert.equal((await closingsOf(ancient)).at(-1)?.id, target);
  assert.equal(
    (await firestore.doc(planOf(ancient)).get()).get('dirtyFrom'),
    null,
  );

  await checkClosingParity(target);
  await checkRebuildBudget(target);

  console.log('Runway alerts server: all checks passed.');
}

async function buildOnPhoneFor(uid: string, start: number, target: string) {
  const plan = planOf(uid);
  const encryption = {
    appId: 'runway' as const,
    keyId: data(uid).keyId,
    keyVersion: 1,
    key: data(uid).key.toString('hex'),
  };
  const items = await firestore.collection(`${plan}/items`).get();
  const billIds = new Set(
    items.docs
      .filter((entry) => entry.get('kind') === 'bill')
      .map((entry) => entry.id),
  );
  const states = await buildOnPhone(
    listMonths(toMonthKey(start), target),
    null,
    async (month) => {
      const from = phoneMonthStart(month);
      const to = phoneMonthStart(phoneNextMonth(month));
      const inMonth = (name: string, field: string) =>
        firestore
          .collection(`${plan}/${name}`)
          .where(field, '>=', from)
          .where(field, '<', to)
          .get();
      const [days, moves, purchases] = await Promise.all([
        inMonth('days', 'expectedOn'),
        inMonth('moves', 'date'),
        inMonth('purchases', 'date'),
      ]);
      return openOnPhone(
        {
          days: days.docs,
          moves: moves.docs,
          purchases: purchases.docs,
          getRecords: async (dayId) =>
            (await firestore.collection(`${plan}/days/${dayId}/records`).get())
              .docs,
        },
        encryption,
        start,
        billIds,
      );
    },
  );
  return states.map((state) => ({
    month: state.month,
    sealed: encodeOnPhone(state),
  }));
}

async function readOnServer(uid: string) {
  const docs = (await firestore.collection(`${planOf(uid)}/closings`).get())
    .docs;
  return docs.map((entry) => ({
    month: entry.id,
    sealed: encodeClosing(
      decodeClosing(
        entry.id,
        openWithKey(
          data(uid).key,
          entry.get('sealed'),
        ) as unknown as ClosingSealed,
      ),
    ),
  }));
}

function withOneRace(uid: string, calls: { count: number }): Firestore {
  return new Proxy(firestore, {
    get(target, prop) {
      if (prop === 'runTransaction') {
        return async (...args: Parameters<Firestore['runTransaction']>) => {
          calls.count += 1;
          if (calls.count === 1) {
            await target
              .doc(planOf(uid))
              .update({ updatedAt: FieldValue.increment(1) });
          }
          return target.runTransaction(...args);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function checkRebuildBudget(target: string) {
  const late = 'alerts-budget-spent';
  await seedPlan(late, true, today - 120 * DAY_MS);
  const figuresOf = () =>
    firestore.doc(`${planOf(late)}/figures/current`).get();
  const spent = await reworkPlan(
    firestore,
    DEV_KEYRING,
    late,
    at(12),
    outbox().send,
    { deadline: Date.now() - 1 },
  );
  assert.equal(spent.kind, 'waiting', 'a spent budget waits');
  assert.ok(
    spent.kind === 'waiting' && spent.wakeAt !== null,
    'a run that may have written nothing asks to run again soon',
  );
  assert.equal(
    (await closingsOf(late)).length,
    0,
    'no chunk starts past the deadline',
  );
  assert.equal((await figuresOf()).exists, false);

  // The rebuild ends inside the budget, which is gone by the time figures would be worked out.
  const counted = { count: 0 };
  const counting = new Proxy(firestore, {
    get(target, prop) {
      if (prop === 'runTransaction') {
        return (...args: Parameters<Firestore['runTransaction']>) => {
          counted.count += 1;
          return target.runTransaction(...args);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const spentAfterRebuild = {
    get deadline() {
      return counted.count === 0 ? Date.now() + 60 * 60_000 : 0;
    },
  };
  const afterRebuild = await reworkPlan(
    counting,
    DEV_KEYRING,
    late,
    at(12),
    outbox().send,
    spentAfterRebuild,
  );
  assert.equal(
    afterRebuild.kind,
    'waiting',
    'no figure pass after a rebuild that used the budget',
  );
  assert.equal(
    (await closingsOf(late)).at(-1)?.id,
    target,
    'the rebuild itself finished',
  );
  assert.equal(
    (await firestore.doc(planOf(late)).get()).get('dirtyFrom'),
    null,
  );
  assert.equal((await figuresOf()).exists, false);

  const next = await run(late, at(12) + 60_000, outbox().send);
  assert.equal(next.kind, 'done', 'the next run works out the figures');
  assert.equal(
    (await figuresOf()).get('planStamp'),
    (await firestore.doc(planOf(late)).get()).get('updatedAt'),
  );
}

async function checkClosingParity(target: string) {
  const uid = 'closings-parity';
  const plan = planOf(uid);
  const start = today - 120 * DAY_MS;
  const firstMonth = toMonthKey(start);
  const payDay = getMonthStart(getNextMonth(firstMonth)) + 2 * DAY_MS;
  const paidDay = payDay + 3 * DAY_MS;
  await seedPlan(uid, true, start);
  await firestore.doc(`${plan}/items/bill-rent`).set({
    id: 'bill-rent',
    kind: 'bill',
    parentId: null,
    createdAt: start,
    endedAt: null,
    archivedAt: null,
    heldReleasedOn: null,
  });
  const day: IncomeDayDoc = {
    id: 'day-1',
    payLineId: 'pay-1',
    sourceId: null,
    expectedOn: payDay,
    arrivedOn: payDay,
    status: 'confirmed',
    createdAt: payDay,
    confirmedAt: payDay,
    doneLineIds: [],
    sealed: null,
  };
  await firestore.doc(`${plan}/days/day-1`).set(day);
  const line = (itemId: string, cents: number, tier: 'must' | 'should') => ({
    lineId: `day-1:${itemId}`,
    itemId,
    part: null,
    name: itemId,
    emoji: null,
    tier,
    demandCents: cents,
    cents,
    shortBy: 0,
    paidBy: [{ dayId: 'day-1', cents }],
    costId: null,
    costName: null,
    repaysFree: false,
  });
  const record: DayRecordDoc = {
    id: 'day-1-confirmed',
    dayId: 'day-1',
    kind: 'confirmed',
    createdAt: payDay,
    supersedesId: null,
    sealed: seal(uid, {
      fingerprint: 'parity',
      stance: 'conservative',
      arrivedCents: 100_000,
      expectedCents: 100_000,
      freeToSpendCents: 30_000,
      lines: [
        line('bill-rent', 50_000, 'must'),
        line(groceries, 20_000, 'should'),
      ],
      differences: [],
    } satisfies ConfirmedSealed),
  };
  await firestore.doc(`${plan}/days/day-1/records/day-1-confirmed`).set(record);
  const paid: MoveDoc = {
    id: 'paid_bill-rent_parity',
    kind: 'billPaid',
    date: paidDay,
    refId: 'bill-rent',
    reversesMoveId: null,
    createdAt: paidDay,
    sealed: seal(uid, {
      amountCents: 50_000,
      paidOn: paidDay,
      fromFreeCents: 0,
      cardId: null,
      auto: null,
    } satisfies BillPaidSealed),
  };
  const cardPayment: MoveDoc = {
    id: 'cardpay-parity',
    kind: 'cardPayment',
    date: paidDay,
    refId: 'card-1',
    reversesMoveId: null,
    createdAt: paidDay,
    sealed: seal(uid, {
      amountCents: 12_000,
      covers: 'full',
    } satisfies CardPaymentSealed),
  };
  await firestore.doc(`${plan}/moves/${paid.id}`).set(paid);
  await firestore.doc(`${plan}/moves/${cardPayment.id}`).set(cardPayment);
  await firestore
    .doc(`${plan}/purchases/parity-spent`)
    .set(purchase(uid, 'parity-spent', 4_500, payDay + DAY_MS));
  await firestore.doc(`${plan}/closings/2099-01`).set({
    id: '2099-01',
    month: '2099-01',
    createdAt: start,
    sealed: seal(uid, { left: 'from another start' }),
  });

  const key = data(uid);
  assert.equal(await rebuildClosingsOnServer(firestore, key, uid, today), true);
  const phone = await buildOnPhoneFor(uid, start, target);
  const server = await readOnServer(uid);
  assert.deepEqual(
    server,
    phone,
    'the server seals the closings the phone would',
  );
  const payMonth = phone.find((entry) => entry.month === toMonthKey(payDay))
    ?.sealed as unknown as ClosingSealed;
  assert.equal(payMonth.arrivedCents, 100_000, 'the confirmed pay is summed');
  assert.equal(payMonth.paid['bill-rent']?.length, 1, 'the bill paid is kept');
  assert.equal(
    payMonth.cardPaid['card-1']?.length,
    1,
    'the card payment is kept',
  );
  assert.equal(payMonth.spentCents, 4_500, 'the purchase is summed');
  assert.equal(
    (await firestore.doc(`${plan}/closings/2099-01`).get()).exists,
    false,
    'a closing past the last closable month is deleted',
  );
  assert.equal((await firestore.doc(plan).get()).get('dirtyFrom'), null);

  // Another writer moves the stamp just as the first chunk commits: the rebuild starts again and still ends right.
  const before = (await firestore.doc(plan).get()).get('updatedAt') as number;
  await firestore
    .doc(plan)
    .update({ dirtyFrom: firstMonth, updatedAt: before + 1 });
  const calls = { count: 0 };
  assert.equal(
    await rebuildClosingsOnServer(withOneRace(uid, calls), key, uid, today),
    true,
  );
  assert.ok(calls.count > 1, 'the refused chunk is tried again');
  assert.equal((await firestore.doc(plan).get()).get('dirtyFrom'), null);
  assert.deepEqual(
    await readOnServer(uid),
    phone,
    'a raced rebuild seals the same closings',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
