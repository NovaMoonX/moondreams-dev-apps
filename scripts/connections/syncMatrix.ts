// Run against the Firestore emulator: `npm run check:connection-sync`.
import assert from 'node:assert/strict';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import {
  deriveSeedDataKey,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import {
  deleteKeptCopies,
  endConnection,
  grantConnection,
  syncConnections,
  updateConnection,
} from '../../functions/src/connections/callables.ts';
import { expireCopies } from '../../functions/src/connections/expire.ts';
import {
  buildNewGrant,
  readGrant,
} from '../../functions/src/connections/grants.ts';
import {
  READER_SINKS,
  SOURCE_ADAPTERS,
} from '../../functions/src/connections/registry.ts';
import type { SourceClient } from '../../functions/src/connections/sourceClient.ts';
import {
  syncGrant,
  type SyncDeps,
} from '../../functions/src/connections/syncRunner.ts';
import {
  toGrantId,
  type SharedRecord,
} from '../../functions/src/vendor/connectionsContract.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FUNCTIONS_EMULATOR = 'true';
if (getApps().length === 0) initializeApp({ projectId: 'demo-sync' });
const firestore = getFirestore();

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 15);
const TODAY = Date.UTC(2026, 10, 10);
const GRANT_ID = toGrantId('helm', 'app:pinch', 'site');
const { manifest } = SOURCE_ADAPTERS['app:pinch'];

const record = (
  ref: string,
  over: Partial<SharedRecord> = {},
): SharedRecord => ({
  sourceRef: ref,
  kind: 'task',
  title: `Title ${ref}`,
  subtitle: null,
  detail: null,
  startAt: null,
  endAt: null,
  isAllDay: false,
  dueAt: null,
  timeZone: null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  sourceUpdatedAt: null,
  extra: {},
  ...over,
});

class FakeSource implements SourceClient {
  records: Record<string, SharedRecord[]> = {};
  failing = new Set<string>();
  isFull = true;
  sourceStatus: 'ok' | 'noAccess' = 'ok';
  async status() {
    return this.sourceStatus;
  }
  async syncPage(
    _connectorId: string,
    _ctx: unknown,
    req: { category: string },
  ) {
    if (this.failing.has(req.category)) throw new Error('boom');
    return {
      records: this.records[req.category] ?? [],
      deletedRefs: [],
      cursor: null,
      isFull: this.isFull,
      isDone: true,
    };
  }
  deepLink(_connectorId: string, ref: string) {
    return `/pinch?ref=${ref}`;
  }
}

let counter = 0;
const setup = async (categories = ['plannedMeals', 'shoppingList']) => {
  counter += 1;
  const uid = `sync-user-${counter}-${Date.now()}`;
  const data = deriveSeedDataKey(DEV_KEYRING, uid);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, data, NOW));
  const grant = buildNewGrant(
    {
      readerAppId: 'helm',
      connectorId: 'app:pinch',
      accountId: 'site',
      categoryIds: categories,
      options: null,
    },
    manifest,
    NOW - DAY,
  );
  const grantRef = firestore.doc(`connections/${uid}/grants/${GRANT_ID}`);
  await grantRef.set(grant);
  const source = new FakeSource();
  let now = NOW;
  const deps: SyncDeps = {
    firestore,
    source,
    sinks: READER_SINKS,
    now: () => now,
  };
  return {
    uid,
    source,
    deps,
    grantRef,
    setNow: (value: number) => {
      now = value;
    },
    run: () => syncGrant(deps, uid, GRANT_ID),
    copies: async () =>
      (await firestore.collection(`apps/helm/users/${uid}/synced`).get()).docs,
    grant: async () => readGrant((await grantRef.get()).data()),
  };
};

type CallRequest = Parameters<typeof updateConnection.run>[0];

const asCaller = (uid: string, data: unknown) =>
  ({ data, auth: { uid, token: {} } }) as unknown as CallRequest;

const refs = (docs: { get(field: string): unknown }[]) =>
  docs.map((doc) => String(doc.get('sourceRef'))).sort();

const rejects = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (error: { code?: string }) => error.code === code);

const main = async () => {
  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b'), record('c')];
    assert.equal(await t.run(), 'synced');
    assert.deepEqual(refs(await t.copies()), ['a', 'b', 'c']);
    const grant = await t.grant();
    assert.equal(grant.categoryState.shoppingList.count, 3);
    assert.equal(grant.categoryState.shoppingList.lastOkAt, NOW);
    assert.equal(grant.categoryState.shoppingList.lastError, null);
    assert.equal(grant.lastSyncAt, NOW);
    assert.equal(grant.syncLeaseUntil, null);
    assert.equal(grant.categoryState.plannedMeals.count, 0);

    t.source.records.shoppingList = [record('a'), record('b')];
    t.source.isFull = false;
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      ['a', 'b', 'c'],
      'a partial read never deletes the unseen',
    );
    t.source.isFull = true;
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      ['a', 'b'],
      'a full read deletes what is gone',
    );
    assert.equal((await t.grant()).categoryState.shoppingList.count, 2);
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b')];
    await t.run();
    const before = Object.fromEntries(
      (await t.copies()).map((doc) => [doc.id, doc.updateTime.toMillis()]),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    t.source.records.shoppingList = [
      record('a'),
      record('b', { title: 'Changed' }),
    ];
    await t.run();
    const after = await t.copies();
    const byRef = Object.fromEntries(
      after.map((doc) => [String(doc.get('sourceRef')), doc]),
    );
    assert.equal(
      byRef.a.updateTime.toMillis(),
      before[byRef.a.id],
      'an unchanged record is not rewritten',
    );
    assert.notEqual(
      byRef.b.updateTime.toMillis(),
      before[byRef.b.id],
      'a changed record is',
    );
    assert.equal(
      String(byRef.a.get('sealed.value')).includes('Title'),
      false,
      'nothing readable sits beside the sealed text',
    );
    assert.equal(JSON.stringify(byRef.a.data()).includes('Title a'), false);
  }

  {
    const t = await setup();
    t.source.records.plannedMeals = [
      record('m1', { kind: 'event', startAt: TODAY, isAllDay: true }),
      record('m-old', {
        kind: 'event',
        startAt: TODAY - 45 * DAY,
        isAllDay: true,
      }),
    ];
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      ['m1'],
      'a record already outside the window is not copied',
    );
    t.setNow(NOW + 40 * DAY);
    t.source.isFull = false;
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      [],
      'a copy more than 30 days past is dropped after any run',
    );
    t.source.isFull = true;
    assert.equal((await t.grant()).categoryState.plannedMeals.count, 0);
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('s1')];
    t.source.records.plannedMeals = [
      record('m1', { kind: 'event', startAt: TODAY, isAllDay: true }),
    ];
    await t.run();
    t.source.failing.add('plannedMeals');
    t.source.records.shoppingList = [record('s1'), record('s2')];
    t.setNow(NOW + 5000);
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      ['m1', 's1', 's2'],
      'a failed page keeps the copies and the other category still syncs',
    );
    const grant = await t.grant();
    assert.deepEqual(grant.categoryState.plannedMeals.lastError, {
      code: 'readFailed',
      at: NOW + 5000,
    });
    assert.equal(grant.categoryState.plannedMeals.lastOkAt, NOW);
    assert.equal(grant.categoryState.plannedMeals.count, 1);
    assert.equal(grant.categoryState.shoppingList.lastOkAt, NOW + 5000);
    assert.deepEqual(grant.errors, [
      { category: 'plannedMeals', code: 'readFailed', at: NOW + 5000 },
    ]);
    t.source.failing.clear();
    await t.run();
    assert.deepEqual(
      (await t.grant()).errors,
      [],
      'a success clears the category error',
    );
  }

  {
    const t = await setup();
    await t.grantRef.update({ syncLeaseUntil: NOW + 60_000 });
    assert.equal(await t.run(), 'skipped', 'a held lease skips the run');
    await t.grantRef.update({ syncLeaseUntil: NOW - 1 });
    assert.equal(await t.run(), 'synced');
    t.source.sourceStatus = 'noAccess';
    await t.run();
    const grant = await t.grant();
    assert.equal(grant.status, 'noAccess');
    assert.equal(grant.syncLeaseUntil, null);
  }

  {
    const t = await setup(['shoppingList']);
    t.source.records.shoppingList = Array.from({ length: 1005 }, (_, index) =>
      record(`s${index}`, { sourceUpdatedAt: index }),
    );
    await t.run();
    assert.equal(
      (await t.copies()).length,
      1000,
      'a category keeps at most 1,000 copies',
    );
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b')];
    t.source.records.plannedMeals = [
      record('m', { kind: 'event', startAt: TODAY, isAllDay: true }),
    ];
    await t.run();

    await updateConnection.run(
      asCaller(t.uid, {
        grantId: GRANT_ID,
        categories: { shoppingList: false },
      }),
    );
    assert.deepEqual(
      refs(await t.copies()),
      ['m'],
      'a switch off deletes its category',
    );
    const off = await t.grant();
    assert.equal(off.categoryState.shoppingList.count, 0);
    assert.equal(off.categoryState.shoppingList.lastOkAt, null);
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b')];
    t.source.records.plannedMeals = [
      record('m', { kind: 'event', startAt: TODAY, isAllDay: true }),
    ];
    await t.run();
    await endConnection.run(
      asCaller(t.uid, { grantId: GRANT_ID, deleteCopies: true }),
    );
    assert.deepEqual(
      await t.copies(),
      [],
      'disconnect with delete removes every copy',
    );
    const grant = await t.grant();
    assert.equal(grant.status, 'ended');
    assert.equal(grant.keptCopies, null);
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b')];
    t.source.records.plannedMeals = [
      record('m', { kind: 'event', startAt: TODAY, isAllDay: true }),
    ];
    await t.run();
    await endConnection.run(
      asCaller(t.uid, { grantId: GRANT_ID, deleteCopies: false }),
    );
    const grant = await t.grant();
    assert.equal(grant.status, 'ended');
    const endedAt = grant.endedAt;
    assert.ok(endedAt !== null);
    const docs = await t.copies();
    assert.equal(docs.length, 3);
    assert.ok(
      docs.every(
        (doc) =>
          doc.get('deleteAfter') === endedAt + 90 * DAY &&
          doc.get('connectionEndedAt') === endedAt,
      ),
      'every kept copy carries exactly endedAt + 90 days',
    );
    assert.deepEqual(grant.keptCopies, {
      count: 3,
      deleteAfter: endedAt + 90 * DAY,
    });

    const reconnected = buildNewGrant(
      {
        readerAppId: 'helm',
        connectorId: 'app:pinch',
        accountId: 'site',
        categoryIds: ['shoppingList'],
        options: null,
      },
      manifest,
      NOW,
      grant.keptCopies,
    );
    assert.deepEqual(
      reconnected.keptCopies,
      grant.keptCopies,
      'a reconnect keeps the kept copies',
    );

    await expireCopies(firestore, READER_SINKS, endedAt + 90 * DAY - 1);
    assert.equal((await t.copies()).length, 3, 'nothing expires early');
    await expireCopies(firestore, READER_SINKS, endedAt + 90 * DAY);
    assert.deepEqual(
      await t.copies(),
      [],
      'expiry at the fixed clock deletes them',
    );
    assert.equal(
      (await t.grant()).keptCopies,
      null,
      'the grant stops counting kept copies',
    );
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a'), record('b')];
    await t.run();
    const request = asCaller(t.uid, { grantId: GRANT_ID, deleteCopies: false });
    await endConnection.run(request);
    const first = await t.grant();
    const docs = await t.copies();
    await Promise.all(docs.map((doc) => doc.ref.update({ deleteAfter: null })));
    await t.grantRef.update({
      keptCopies: { count: 0, deleteAfter: first.endedAt },
    });
    await endConnection.run(request);
    const again = await t.grant();
    assert.equal(again.endedAt, first.endedAt, 'a second end changes no date');
    assert.equal(
      again.keptCopies?.count,
      2,
      'a second end re-runs the cleanup',
    );
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a')];
    await t.run();
    const stray = firestore.doc(`apps/helm/users/${t.uid}/synced/stray`);
    const [copy] = await t.copies();
    await stray.set({
      ...copy.data(),
      category: 'plannedMeals',
      sourceRef: 'x',
    });
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      ['a'],
      'the next sync clears copies of a category that is off',
    );
  }

  {
    const t = await setup();
    const session = READER_SINKS.helm.openSession(firestore, t.uid);
    t.source.records.shoppingList = [record('a')];
    await t.run();
    await session.keepGrant(GRANT_ID, NOW, NOW + 10 * DAY);
    await session.keepGrant(GRANT_ID, NOW + DAY, NOW + 90 * DAY);
    const [kept] = await t.copies();
    assert.equal(
      kept.get('deleteAfter'),
      NOW + 10 * DAY,
      'a second keep never moves the date later',
    );
    assert.equal(await session.countKept(GRANT_ID), 1);
  }

  {
    const t = await setup();
    t.source.records.shoppingList = [record('a')];
    await t.run();
    await endConnection.run(
      asCaller(t.uid, { grantId: GRANT_ID, deleteCopies: false }),
    );
    const result = await deleteKeptCopies.run(
      asCaller(t.uid, { grantId: GRANT_ID }),
    );
    assert.deepEqual(result, { deleted: 1 });
    assert.deepEqual(await t.copies(), []);
    assert.equal((await t.grant()).keptCopies, null);
    assert.deepEqual(
      await deleteKeptCopies.run(asCaller(t.uid, { grantId: GRANT_ID })),
      { deleted: 0 },
    );
  }

  {
    const t = await setup();
    const session = READER_SINKS.helm.openSession(firestore, t.uid);
    t.source.records.shoppingList = [record('a')];
    await t.run();
    assert.equal(await session.keepGrant(GRANT_ID, NOW, NOW + 90 * DAY), 1);
    assert.ok(
      (await t.copies()).every(
        (doc) => doc.get('deleteAfter') === NOW + 90 * DAY,
      ),
    );
  }

  {
    const t = await setup();
    const request = (data: unknown) => asCaller(t.uid, data);
    await rejects(
      grantConnection.run(
        request({
          readerAppId: 'nothing',
          connectorId: 'app:pinch',
          accountId: 'site',
          categoryIds: ['shoppingList'],
        }),
      ),
      'invalid-argument',
    );
    await rejects(
      grantConnection.run(
        request({
          readerAppId: 'helm',
          connectorId: 'app:pinch',
          accountId: 'site',
          categoryIds: ['nothing'],
        }),
      ),
      'invalid-argument',
    );
    await rejects(
      grantConnection.run(
        request({
          readerAppId: 'helm',
          connectorId: 'app:nothing',
          accountId: 'site',
          categoryIds: ['shoppingList'],
        }),
      ),
      'invalid-argument',
    );
    await rejects(
      updateConnection.run(
        request({ grantId: GRANT_ID, categories: { nothing: true } }),
      ),
      'invalid-argument',
    );
    await rejects(
      syncConnections.run(request({ grantId: 'bad' })),
      'invalid-argument',
    );
    await rejects(
      syncConnections.run(
        request({ grantId: toGrantId('helm', 'app:pinch', 'other') }),
      ),
      'not-found',
    );
    await endConnection.run(request({ grantId: GRANT_ID, deleteCopies: true }));
    await rejects(
      updateConnection.run(
        request({ grantId: GRANT_ID, categories: { shoppingList: true } }),
      ),
      'failed-precondition',
    );
    await rejects(
      syncConnections.run(request({ grantId: GRANT_ID })),
      'failed-precondition',
    );
    await rejects(
      endConnection.run({
        data: { grantId: GRANT_ID, deleteCopies: true },
      } as unknown as CallRequest),
      'unauthenticated',
    );
  }

  console.log('Connection sync matrix passed.');
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
