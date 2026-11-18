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
  applyCategoryChanges,
  assertSeenScopes,
  buildNewGrant,
  readGrant,
  readUpdateConnectionRequest,
} from '../../functions/src/connections/grants.ts';
import { toSyncedId } from '../../functions/src/apps/helm/connections/sink.ts';
import { readUnseenNews } from '../../src/lib/connections/newReads.ts';
import {
  BULK_CALENDAR,
  FIXTURE_CANCELLED_REF,
  FIXTURE_DUP_TOKEN,
  FIXTURE_GONE_LATER_TOKEN,
  FIXTURE_GONE_TOKEN,
  FIXTURE_WINNER_CANCEL_TOKEN,
  TZ_CALENDARS,
} from '../../functions/src/connections/google/fixtures.ts';
import {
  READER_SINKS,
  SOURCE_ADAPTERS,
} from '../../functions/src/connections/registry.ts';
import {
  InProcessSourceClient,
  type SourceClient,
} from '../../functions/src/connections/sourceClient.ts';
import {
  syncGrant,
  type SyncDeps,
} from '../../functions/src/connections/syncRunner.ts';
import { ReconnectNeeded } from '../../functions/src/connections/tokens.ts';
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
  needsReconnect = false;
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
    if (this.needsReconnect) throw new ReconnectNeeded();
    if (this.failing.has(req.category)) throw new Error('boom');
    return {
      records: this.records[req.category] ?? [],
      deletedRefs: [],
      cursor: null,
      isFull: this.isFull,
      isDone: true,
      resumeState: null,
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

const CALENDAR_CONNECTOR = 'google:calendar';
const PERSONAL = {
  accountId: 'g_0000000000000001',
  email: 'personal@example.com',
  calendars: [
    'personal@example.com',
    'shifts-personal@group.calendar.google.com',
  ],
};
const WORK = {
  accountId: 'g_0000000000000002',
  email: 'work@example.com',
  calendars: ['work@example.com', 'team-work@group.calendar.google.com'],
};

const setupCalendar = async (account: typeof PERSONAL) => {
  counter += 1;
  const uid = `sync-cal-${counter}-${Date.now()}`;
  const grantId = toGrantId('helm', CALENDAR_CONNECTOR, account.accountId);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(
      wrapDataKey(DEV_KEYRING, uid, deriveSeedDataKey(DEV_KEYRING, uid), NOW),
    );
  const accountRef = firestore.doc(
    `connections/${uid}/accounts/${account.accountId}`,
  );
  await accountRef.set({
    provider: 'google',
    email: account.email,
    label: null,
    grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    status: 'live',
    connectedAt: NOW,
    lastError: null,
  });
  await firestore
    .doc(`connectionsServer/${uid}/tokens/${account.accountId}`)
    .set({ isFixture: true });
  const adapter = SOURCE_ADAPTERS[CALENDAR_CONNECTOR];
  const grantRef = firestore.doc(`connections/${uid}/grants/${grantId}`);
  await grantRef.set({
    ...buildNewGrant(
      {
        readerAppId: 'helm',
        connectorId: CALENDAR_CONNECTOR,
        accountId: account.accountId,
        categoryIds: ['events'],
        options: { calendarIds: account.calendars },
      },
      adapter.manifest,
      Date.now() - DAY,
    ),
    options: { calendarIds: account.calendars },
  });
  const deps: SyncDeps = {
    firestore,
    source: new InProcessSourceClient(),
    sinks: READER_SINKS,
    now: () => Date.now(),
  };
  const cursorRef = firestore.doc(
    `connectionsServer/${uid}/cursors/${grantId}__events`,
  );
  return {
    uid,
    grantId,
    accountRef,
    grantRef,
    cursorRef,
    run: () => syncGrant(deps, uid, grantId),
    copies: async () =>
      (await firestore.collection(`apps/helm/users/${uid}/synced`).get()).docs,
    grant: async () => readGrant((await grantRef.get()).data()),
    ctx: async () => ({
      uid,
      accountId: account.accountId,
      grant: readGrant((await grantRef.get()).data()),
    }),
  };
};

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
    const fresh = buildNewGrant(
      {
        readerAppId: 'helm',
        connectorId: 'app:pinch',
        accountId: 'site',
        categoryIds: ['shoppingList'],
        options: null,
      },
      manifest,
      NOW,
    );
    assert.equal(fresh.categories.shoppingList.seenScopeVersion, 1);
    assert.equal(readGrant({}).categories.shoppingList, undefined);
    assert.equal(
      readGrant({ categories: { shoppingList: { isOn: true } } }).categories
        .shoppingList.seenScopeVersion,
      null,
      'a legacy grant reads its seen scope as null',
    );
    assert.equal(
      applyCategoryChanges(fresh, {}, manifest, NOW, { shoppingList: 1 })
        .shoppingList.seenScopeVersion,
      1,
    );
    const request = (seenScopes: unknown) => () =>
      readUpdateConnectionRequest({ grantId: GRANT_ID, seenScopes });
    assert.deepEqual(request({ shoppingList: 1 })().seenScopes, {
      shoppingList: 1,
    });
    assert.throws(request({ shoppingList: 1.5 }), 'a fraction is refused');
    assert.throws(request({ shoppingList: 0 }), 'zero is refused');
    assert.throws(request({}), 'an empty map is refused');
    assert.throws(
      () => assertSeenScopes(manifest, { shoppingList: 2 }),
      'a version past the manifest is refused',
    );
    assert.throws(
      () => assertSeenScopes(manifest, { nope: 1 }),
      'an unknown category is refused',
    );
    const partial = {
      ...fresh,
      categories: { shoppingList: fresh.categories.shoppingList },
    };
    assert.deepEqual(
      applyCategoryChanges(partial, {}, manifest, NOW, { useSoon: 1 }).useSoon,
      { isOn: false, changedAt: NOW, seenScopeVersion: 1 },
      'seeing a category the grant never held records it, still off',
    );
    const shipped = {
      ...manifest,
      categories: manifest.categories.map((category) =>
        category.id === 'shoppingList'
          ? {
              ...category,
              reads: [
                ...category.reads,
                { label: 'Added', sinceVersion: 2, addedOn: '2026-05-01' },
              ],
              scopeVersion: 2,
            }
          : category,
      ),
    };
    const may2 = Date.parse('2026-05-02T12:00:00Z');
    assert.deepEqual(
      Object.keys(readUnseenNews(shipped, fresh.categories, may2)),
      ['shoppingList'],
      'a read shipped yesterday is new to someone who saw version 1',
    );
    assert.deepEqual(
      readUnseenNews(shipped, fresh.categories, may2 + 40 * DAY),
      {},
      'it stops being new after the window',
    );
    assert.deepEqual(
      readUnseenNews(
        shipped,
        applyCategoryChanges(fresh, {}, shipped, NOW, { shoppingList: 2 }),
        may2,
      ),
      {},
      'seeing it clears it',
    );
    assert.deepEqual(
      readUnseenNews(manifest, {}, may2),
      {},
      'reads there from the start are never new',
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

  {
    const t = await setupCalendar(PERSONAL);
    const [personal, shifts] = PERSONAL.calendars;
    await t.run();
    const first = await t.copies();
    assert.deepEqual(
      refs(first),
      [
        `${personal}|fx-cake-tasting`,
        `${personal}|fx-dentist`,
        `${personal}|fx-lunch`,
        `${personal}|fx-maya`,
        `${personal}|fx-pottery`,
        `${personal}|fx-starlight`,
        `${shifts}|fx-dinner-shift`,
        `${shifts}|fx-night-shift`,
      ],
      'a full read copies each event once, the same event on two calendars once',
    );
    const lunch = first.find(
      (doc) => doc.get('sourceRef') === `${personal}|fx-lunch`,
    );
    assert.equal(
      lunch?.get('calendarKey'),
      `${PERSONAL.accountId}/${personal}`,
    );
    assert.equal(lunch?.get('isBusy'), true);
    assert.equal(lunch?.get('isAllDay'), false);
    assert.equal((await t.grant()).categoryState.events.count, 8);
    const saved = (await t.cursorRef.get()).get('state') as string;
    assert.ok(saved.includes('fixture-sync'), 'the sync token is saved');

    const stray = firestore.doc(`apps/helm/users/${t.uid}/synced/stray`);
    await stray.set({ ...first[0].data(), sourceRef: 'stray' });
    const before = Object.fromEntries(
      first.map((doc) => [doc.id, doc.updateTime.toMillis()]),
    );
    await t.run();
    const second = await t.copies();
    assert.equal(
      second.length,
      9,
      'a second run is incremental: the unseen copy is kept',
    );
    assert.ok(
      first.every(
        (doc) =>
          before[doc.id] ===
          second.find((c) => c.id === doc.id)?.updateTime.toMillis(),
      ),
      'nothing is rewritten',
    );

    await t.cursorRef.set({
      state: saved.replaceAll('fixture-sync', FIXTURE_GONE_TOKEN),
      updatedAt: NOW,
    });
    await t.run();
    assert.equal(
      (await t.copies()).length,
      8,
      'a gone token drops to a full re-read, which clears the unseen',
    );

    await t.grantRef.update({ options: { calendarIds: [personal] } });
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      [
        `${personal}|fx-cake-tasting`,
        `${personal}|fx-dentist`,
        `${personal}|fx-lunch`,
        `${personal}|fx-maya`,
        `${personal}|fx-pottery`,
        `${personal}|fx-starlight`,
      ],
      'dropping a calendar drops its copies',
    );

    await t.grantRef.update({ options: { calendarIds: [] } });
    await t.run();
    assert.deepEqual(
      await t.copies(),
      [],
      'no calendars chosen leaves nothing',
    );
  }

  {
    const t = await setupCalendar(WORK);
    const [work, team] = WORK.calendars;
    await t.run();
    const docs = await t.copies();
    assert.deepEqual(
      refs(docs),
      [`${team}|fx-team-lunch`, `${work}|fx-ooo`, `${work}|fx-standup`],
      'declined events are not copied',
    );
    const ooo = docs.find((doc) => doc.get('sourceRef') === `${work}|fx-ooo`);
    assert.equal(ooo?.get('isBusy'), false, 'a free event blocks nothing');
    assert.equal(ooo?.get('isAllDay'), true);
    assert.equal(
      Number(ooo?.get('startAt')) % DAY,
      0,
      'an all-day event is UTC midnight',
    );
    const state = JSON.parse((await t.cursorRef.get()).get('state') as string);
    assert.equal(state.tokens[work], 'fixture-sync');
    assert.equal(
      state.tokens[team],
      null,
      'a calendar with no token is read by update time',
    );

    await t.run();
    assert.equal(
      (await t.copies()).length,
      3,
      'the update-time read changes nothing',
    );

    const [standup] = docs.filter(
      (doc) => doc.get('sourceRef') === `${work}|fx-standup`,
    );
    await firestore
      .doc(
        `apps/helm/users/${t.uid}/synced/${toSyncedId(t.grantId, 'events', FIXTURE_CANCELLED_REF)}`,
      )
      .set({ ...standup.data(), sourceRef: FIXTURE_CANCELLED_REF });
    await t.cursorRef.set({
      state: JSON.stringify({
        ...state,
        tokens: { ...state.tokens, [work]: 'fixture-changes' },
      }),
      updatedAt: NOW,
    });
    await t.run();
    assert.equal(
      (await t.copies()).some(
        (doc) => doc.get('sourceRef') === FIXTURE_CANCELLED_REF,
      ),
      false,
      'a cancelled event deletes its copy',
    );
    assert.equal((await t.copies()).length, 3);

    const adapter = SOURCE_ADAPTERS[CALENDAR_CONNECTOR];
    const ctx = await t.ctx();
    assert.equal(await adapter.status(ctx), 'ok');
    await t.accountRef.update({ status: 'needsReconnect' });
    assert.equal(await adapter.status(ctx), 'needsReconnect');
    await t.run();
    assert.equal((await t.grant()).status, 'needsReconnect');
    await t.accountRef.update({ status: 'revoked' });
    assert.equal(await adapter.status(ctx), 'noAccess');
    await t.accountRef.delete();
    assert.equal(await adapter.status(ctx), 'noAccess');
    assert.equal(
      adapter.deepLink(`${work}|fx-standup`, ctx),
      `https://www.google.com/calendar/event?eid=${Buffer.from(`fx-standup ${work}`).toString('base64url')}`,
    );
  }

  {
    const zones = {
      accountId: 'g_0000000000000003',
      email: 'personal@example.com',
      calendars: TZ_CALENDARS,
    };
    const t = await setupCalendar(zones);
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      [`${TZ_CALENDARS[0]}|fx-offsite-a`],
      'the same event on calendars in different UTC offsets is kept once',
    );
  }

  {
    const bulk = {
      accountId: 'g_0000000000000004',
      email: 'personal@example.com',
      calendars: [BULK_CALENDAR],
    };
    const t = await setupCalendar(bulk);
    await t.run();
    const kept = refs(await t.copies());
    assert.equal(kept.length, 1000, 'a category keeps at most 1,000 events');
    assert.ok(kept.includes(`${BULK_CALENDAR}|bulk-0000`));
    assert.ok(kept.includes(`${BULK_CALENDAR}|bulk-0999`));
    assert.equal(
      kept.includes(`${BULK_CALENDAR}|bulk-1000`),
      false,
      'the earliest are kept',
    );
    assert.equal(
      (await t.cursorRef.get()).exists,
      false,
      'a capped read saves nothing, so the next one is a full read',
    );
    await t.run();
    assert.deepEqual(refs(await t.copies()), kept);
  }

  {
    const [personal] = PERSONAL.calendars;
    const t = await setupCalendar({ ...PERSONAL, calendars: [personal] });
    await t.run();
    const state = JSON.parse((await t.cursorRef.get()).get('state') as string);
    await t.cursorRef.set({
      state: JSON.stringify({
        ...state,
        tokens: { [personal]: FIXTURE_GONE_LATER_TOKEN },
      }),
      updatedAt: NOW,
    });
    const [kept] = await t.copies();
    await firestore
      .doc(`apps/helm/users/${t.uid}/synced/stray`)
      .set({ ...kept.data(), sourceRef: 'stray' });
    await t.run();
    const after = JSON.parse((await t.cursorRef.get()).get('state') as string);
    assert.equal(
      after.tokens[personal],
      'fixture-sync',
      'a gone token on a later page restarts the read in full',
    );
    assert.deepEqual((await t.grant()).errors, []);
    assert.equal(
      (await t.copies()).length,
      6,
      'a restarted read removes the copy the source no longer has',
    );
  }

  {
    const t = await setupCalendar(WORK);
    const team = WORK.calendars[1];
    await t.run();
    const state = JSON.parse((await t.cursorRef.get()).get('state') as string);
    const [lunch] = (await t.copies()).filter(
      (doc) => doc.get('sourceRef') === `${team}|fx-team-lunch`,
    );
    await firestore
      .doc(`apps/helm/users/${t.uid}/synced/stray`)
      .set({ ...lunch.data(), sourceRef: 'stray' });
    await lunch.ref.delete();
    await t.run();
    assert.equal(
      (await t.copies()).some(
        (doc) => doc.get('sourceRef') === lunch.get('sourceRef'),
      ),
      false,
      'a read by update time sees only what changed since the last one',
    );
    await t.cursorRef.set({
      state: JSON.stringify({ ...state, syncedAt: Date.now() - 8 * DAY }),
      updatedAt: NOW,
    });
    await t.run();
    const copies = await t.copies();
    assert.ok(
      copies.some((doc) => doc.get('sourceRef') === lunch.get('sourceRef')),
      'a calendar with no sync token is read from the last read time minus a margin',
    );
    assert.ok(
      copies.some((doc) => doc.get('sourceRef') === 'stray'),
      'and it stays an incremental read',
    );
  }

  {
    const [personal, shifts] = PERSONAL.calendars;
    const t = await setupCalendar(PERSONAL);
    const readState = async () =>
      JSON.parse((await t.cursorRef.get()).get('state') as string);
    const pottery = `${personal}|fx-pottery`;
    await t.run();
    const first = await readState();
    assert.deepEqual(
      Object.values(first.dupes),
      [pottery],
      'the winner of a dropped duplicate is remembered',
    );
    const before = refs(await t.copies());
    await t.cursorRef.set({
      state: JSON.stringify({
        ...first,
        tokens: { [personal]: 'fixture-sync', [shifts]: FIXTURE_DUP_TOKEN },
      }),
      updatedAt: NOW,
    });
    await t.run();
    assert.deepEqual(
      refs(await t.copies()),
      before,
      'an incremental read of a dropped duplicate leaves it dropped',
    );
    assert.deepEqual(Object.values((await readState()).dupes), [pottery]);

    await t.cursorRef.set({
      state: JSON.stringify({
        ...first,
        tokens: {
          [personal]: FIXTURE_WINNER_CANCEL_TOKEN,
          [shifts]: 'fixture-sync',
        },
      }),
      updatedAt: NOW,
    });
    await t.run();
    assert.equal(refs(await t.copies()).includes(pottery), false);
    assert.equal(
      (await t.cursorRef.get()).exists,
      false,
      'a cancelled winner forces the next read to be full',
    );
    await t.run();
    assert.deepEqual(refs(await t.copies()), before);
  }

  {
    const adapter = SOURCE_ADAPTERS[CALENDAR_CONNECTOR];
    const read = async (account: typeof PERSONAL) => {
      const t = await setupCalendar(account);
      return adapter.readOptions?.({
        firestore,
        uid: t.uid,
        accountId: account.accountId,
      });
    };
    const personal = await read(PERSONAL);
    assert.deepEqual(
      personal?.map((option) => [option.id, option.isOnByDefault]),
      [
        ['personal@example.com', true],
        ['en.usa#holiday@group.v.calendar.google.com', false],
        ['shifts-personal@group.calendar.google.com', true],
      ],
    );
    assert.equal(personal?.[0].isPrimary, true);
    const work = await read(WORK);
    assert.deepEqual(
      work?.map((option) => [option.name, option.isOnByDefault]),
      [
        ['Work', true],
        ['Team', false],
      ],
    );
  }

  {
    const t = await setup();
    t.source.needsReconnect = true;
    t.source.records.shoppingList = [record('a')];
    await t.run();
    const grant = await t.grant();
    assert.deepEqual(grant.errors, [
      { category: 'plannedMeals', code: 'needsReconnect', at: NOW },
    ]);
    assert.equal(
      grant.categoryState.shoppingList.lastOkAt,
      null,
      'a reconnect error skips the other categories',
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
