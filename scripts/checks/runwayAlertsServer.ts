// Run against the Firestore emulator: `npm run check:runway-alerts-server`. After a rework the server judges the person's alerts, sends one push when one goes off, and holds one that goes off in quiet hours until 08:00 local.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { reworkPlan } from '../../functions/src/apps/runway/figures/reworkPlan.ts';
import type { SendAlertPush } from '../../functions/src/apps/runway/figures/alerts.ts';
import { SEALED_SCHEMA_VERSION } from '../../functions/src/apps/runway/link/linkShared.ts';
import {
  DEV_KEYRING,
  deriveSeedDataKey,
  sealWithKey,
  wrapDataKey,
  wrappedKeyPath,
} from '../../functions/src/apps/runway/planKey.ts';
import type {
  AlertDoc,
  AlertSealed,
  AlertStateDoc,
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

const purchase = (uid: string, id: string, cents: number): PurchaseDoc => ({
  id,
  date: today - DAY_MS,
  source: 'manual',
  status: 'posted',
  needsHome: false,
  accountId: null,
  expenseId: null,
  dedupeKey: null,
  emailEventId: null,
  emailWaiting: null,
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

async function seedPlan(uid: string, isTracking: boolean) {
  const plan = planOf(uid);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, data(uid), at(0)));
  await firestore.doc(plan).set({
    uid,
    createdAt: startDate,
    updatedAt: startDate,
    stance: 'conservative',
    startDate,
    trackingPeriods: isTracking
      ? [{ from: startDate, to: null, linkedFrom: startDate }]
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
        date: startDate,
        refId: id,
        reversesMoveId: null,
        createdAt: startDate,
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

  console.log('Runway alerts server: all checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
