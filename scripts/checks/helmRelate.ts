// The nightly grouping against the Firestore emulator with the fake batch provider: `npm run check:helm-relate`.
import assert from 'node:assert/strict';

// The functions' own copy of the SDK, so the sentinels the server code writes are the classes this client expects.
const fn = '../../functions/node_modules';
const { getApps, initializeApp } = await import(
  `${fn}/firebase-admin/lib/app/index.js`
);
const { getFirestore } = await import(
  `${fn}/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-helm-relate';
if (getApps().length === 0)
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const firestore = getFirestore();

const { runHelmReflectionPass } =
  await import('../../functions/src/apps/helm/reflection/runHelmReflection.ts');
const { applyRelateOutcome } =
  await import('../../functions/src/apps/helm/reflection/relate/writeRelate.ts');
const { toAlias } =
  await import('../../functions/src/apps/helm/reflection/buildReflectRequest.ts');
const { RUNS_PATH } =
  await import('../../functions/src/apps/helm/reflection/reflectionRuns.ts');
const { RELATE_SYNCED_CATEGORIES: SERVER_CATEGORIES } =
  await import('../../functions/src/apps/helm/reflection/relate/relateRuns.ts');
const { RELATE_SYNCED_CATEGORIES } =
  await import('../../src/apps/helm/constants.ts');
const { toGroupingId, readGrouping } =
  await import('../../functions/src/apps/helm/nomos/grouping.ts');
const { readContextRelatedThings } =
  await import('../../functions/src/apps/helm/nomos/relatedThings.ts');
const { buildContext } =
  await import('../../functions/src/apps/helm/nomos/buildContext.ts');
const { createFakeBatchProvider } =
  await import('../../functions/src/ai/providers/fakeBatchProvider.ts');
const { DEV_KEYRING } = await import('../../functions/src/appKeys/keyring.ts');
const { wrapDataKey } = await import('../../functions/src/appKeys/wrap.ts');
const { deriveSeedDataKey, openForHelm, sealForHelm, wrappedKeyPath } =
  await import('../../functions/src/apps/helm/helmKey.ts');

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, run: () => Promise<void>) =>
  tests.push([name, run]);

const NOW = Date.parse('2026-11-10T10:00:00Z');
const HOUR = 3_600_000;
const DAY_MS = 24 * HOUR;
const DAY = '2026-11-10';
const U = 'relate-user';
const OTHER = 'relate-other';
const base = (uid: string) => `apps/helm/users/${uid}`;
const keyFor = (uid: string) => ({
  ...deriveSeedDataKey(DEV_KEYRING, uid),
  keyVersion: 1,
});
const clean = () => firestore.recursiveDelete(firestore.collection('apps'));

const taskAlias = (id: string, uid = U) => toAlias('k', uid, id);
const noteAlias = (id: string, uid = U) => toAlias('n', uid, id);
const syncedAlias = (id: string, uid = U) => toAlias('s', uid, id);
const projectAlias = (id: string, uid = U) => toAlias('p', uid, id);

interface Setup {
  uid?: string;
  isLearningOn?: boolean;
}

const setup = async ({ uid = U, isLearningOn = true }: Setup = {}) => {
  const key = keyFor(uid);
  const doc = (path: string, data: Record<string, unknown>) =>
    firestore.doc(`${base(uid)}/${path}`).set(data);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, key, NOW));
  await firestore.doc(base(uid)).set({
    timeZone: 'UTC',
    isLearningOn,
    relateDueAt: NOW - HOUR,
    forgottenAt: null,
    selfWhoId: null,
  });
  await doc('who/w1', {
    isSelf: false,
    kind: 'person',
    sealed: sealForHelm(key, { name: 'Dana', aliases: [] }),
  });
  await doc('projects/pMove', {
    status: 'active',
    kind: 'project',
    privacy: 'ordinary',
    createdAt: NOW - 20 * DAY_MS,
    targetDate: NOW + 20 * DAY_MS,
    whoRoles: { w1: 'key' },
    sealed: sealForHelm(key, { name: 'Moving' }),
  });
  await doc('projects/pOther', {
    status: 'active',
    kind: 'project',
    privacy: 'ordinary',
    createdAt: NOW - 20 * DAY_MS,
    targetDate: null,
    whoRoles: {},
    sealed: sealForHelm(key, { name: 'Garden' }),
  });
  const task = (
    id: string,
    title: string,
    extra: Record<string, unknown> = {},
    words: Record<string, unknown> = {},
  ) =>
    doc(`tasks/${id}`, {
      status: 'open',
      projectId: null,
      whoIds: [],
      due: null,
      privacy: 'ordinary',
      completedAt: null,
      createdAt: NOW - DAY_MS,
      ...extra,
      sealed: sealForHelm(key, { title, ...words }),
    });
  await task('t1', 'Pack the Moving boxes');
  await task('t2', 'Call the movers', { whoIds: ['w1'] });
  await task('t3', 'Order soil', { projectId: 'pOther' });
  await task('t4', 'Book a plumber');
  await doc('synced/s1', {
    connectorId: 'app:runway',
    accountId: 'a',
    grantId: 'g',
    category: 'horizon',
    kind: 'project',
    sourceRef: 'r1',
    startAt: null,
    endAt: null,
    dueAt: NOW + 21 * DAY_MS,
    isAllDay: true,
    helmRef: null,
    connectionEndedAt: null,
    deleteAfter: null,
    sealed: sealForHelm(key, { title: 'Moving fund', extra: {} }),
  });
  await doc('notes/n1', {
    topicIds: [],
    projectIds: [],
    privacy: 'ordinary',
    createdAt: NOW - DAY_MS,
    sealed: sealForHelm(key, {
      title: 'Moving checklist',
      body: 'secret body',
    }),
  });
};

const usage = {
  inputTokens: 4000,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

interface Entry {
  sources: string[];
  parent?: string;
  parentKind?: 'project' | 'topic';
  proposedTitle?: string;
  confidence?: 'certain' | 'likely' | 'unsure';
}

const answerOf = (entries: Entry[]) => ({
  type: 'answer' as const,
  json: {
    groupings: entries.map((entry) => ({
      parent: '',
      parentKind: 'project',
      proposedTitle: '',
      confidence: 'likely',
      evidence: [],
      ...entry,
    })),
  },
  usage,
});

const prompts: string[] = [];
let night = 0;

/** One whole night: the request is sent, then the answer is collected a few hours later. */
const runNight = async (entries: Entry[]) => {
  night += 1;
  const start = NOW + night * 2 * DAY_MS;
  await firestore.doc(base(U)).update({ relateDueAt: start - HOUR });
  const client = createFakeBatchProvider([answerOf(entries)]);
  const submit = client.submit.bind(client);
  client.submit = (requests) => {
    prompts.push(...requests.map((request) => JSON.stringify(request)));
    return submit(requests);
  };
  await runHelmReflectionPass(firestore, client, DEV_KEYRING, start);
  await runHelmReflectionPass(firestore, client, DEV_KEYRING, start + HOUR);
  return client;
};

const groupings = async (uid = U) =>
  (await firestore.collection(`${base(uid)}/groupings`).get()).docs.map(
    (doc: { id: string; data: () => Record<string, unknown> }) => ({
      id: doc.id,
      ...doc.data(),
    }),
  ) as (Record<string, unknown> & {
    id: string;
    sourceKeys: string[];
    sealed: unknown;
  })[];
const task = async (id: string) =>
  (await firestore.doc(`${base(U)}/tasks/${id}`).get()).data();
const wordsOf = (grouping: { sealed: unknown }, uid = U) =>
  openForHelm(keyFor(uid), grouping.sealed as never) as {
    proposedTitle: string | null;
    titles: Record<string, string>;
  };
const snapshotAll = async () =>
  Object.fromEntries(
    (await firestore.collectionGroup('tasks').get()).docs.map(
      (doc: { ref: { path: string }; data: () => unknown }) => [
        doc.ref.path,
        JSON.stringify(doc.data()),
      ],
    ),
  );
const storeGrouping = async (
  keys: string[],
  state: string,
  extra: Record<string, unknown> = {},
) => {
  const id = toGroupingId(U, keys);
  await firestore.doc(`${base(U)}/groupings/${id}`).set({
    parentKind: 'project',
    parentId: null,
    sourceKeys: [...keys].sort(),
    sources: keys.map((key) => ({
      key,
      app: key.startsWith('synced/') ? 'app:runway' : null,
      kind: key.startsWith('synced/') ? 'project' : 'task',
    })),
    linkedKeys: [],
    state,
    confidence: 'likely',
    evidence: [],
    declineCount: 0,
    nextOfferAfter: null,
    answeredAt: null,
    toldAt: null,
    executionId: null,
    dayKey: DAY,
    proposedAt: NOW,
    updatedAt: NOW,
    privacy: 'ordinary',
    createdBy: 'nomos',
    sealed: sealForHelm(keyFor(U), {
      proposedTitle: 'Moving',
      emoji: null,
      titles: {},
    }),
    ...extra,
  });
  return id;
};

test('the synced categories match the device list', async () => {
  assert.deepEqual([...SERVER_CATEGORIES], [...RELATE_SYNCED_CATEGORIES]);
});

test('a grouping has a stable id, one write, and the same answer again changes nothing', async () => {
  await setup();
  const keys = ['tasks/t4', 'synced/s1'];
  const entry = {
    sources: [taskAlias('t4'), syncedAlias('s1')],
    proposedTitle: 'Moving',
  };
  await runNight([entry]);
  const first = await groupings();
  assert.equal(first.length, 1);
  assert.equal(first[0].id, toGroupingId(U, [...keys].reverse()));
  assert.equal(first[0].state, 'proposed');
  await runNight([entry]);
  const second = await groupings();
  assert.equal(second.length, 1);
  assert.equal(
    second[0].updatedAt,
    first[0].updatedAt,
    'nothing was rewritten',
  );
});

test('collecting the same request again writes nothing', async () => {
  await setup();
  const client = await runNight([
    { sources: [taskAlias('t4'), syncedAlias('s1')], proposedTitle: 'Moving' },
  ]);
  const [run] = (await firestore.collection(RUNS_PATH).get()).docs;
  const result = {
    customId: client.created[0].customIds[0],
    outcome: 'succeeded' as const,
    output: answerOf([]).json,
    usage,
  };
  assert.equal(
    await applyRelateOutcome(firestore, DEV_KEYRING, {
      runId: run.id,
      customId: result.customId,
      result,
      now: NOW + 9 * DAY_MS,
    }),
    'skipped',
  );
  assert.equal((await groupings()).length, 1);
});

test('a code the request never held is refused', async () => {
  await setup();
  await runNight([
    { sources: [taskAlias('t4'), 'sdeadbeef'], proposedTitle: 'Moving' },
    { sources: [taskAlias('t4'), syncedAlias('s1')], parent: 'pdeadbeef' },
  ]);
  assert.equal((await groupings()).length, 0);
});

test('fewer than two things, or things from one place, are refused', async () => {
  await setup();
  await runNight([
    { sources: [taskAlias('t4')], proposedTitle: 'Plumbing' },
    {
      sources: [taskAlias('t4'), taskAlias('t1')],
      proposedTitle: 'Odd jobs',
    },
  ]);
  assert.equal((await groupings()).length, 0);
});

test('a thing already grouped is refused', async () => {
  await setup();
  await storeGrouping(['tasks/t4', 'synced/s1'], 'groupedByYou');
  await runNight([
    {
      sources: [taskAlias('t4'), taskAlias('t1'), syncedAlias('s1')],
      proposedTitle: 'Moving',
    },
  ]);
  const stored = await groupings();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].state, 'groupedByYou');
});

test('a certain answer fills only empty links, and says so in an execution', async () => {
  await setup();
  await runNight([
    {
      sources: [taskAlias('t1'), taskAlias('t2'), syncedAlias('s1')],
      parent: projectAlias('pMove'),
      confidence: 'certain',
    },
  ]);
  const [grouping] = await groupings();
  assert.equal(grouping.state, 'filed');
  assert.equal(grouping.parentId, 'pMove');
  assert.equal(grouping.executionId, `relate-${grouping.id}`);
  assert.equal((await task('t1'))?.projectId, 'pMove');
  assert.equal((await task('t2'))?.projectId, 'pMove');
  assert.equal((await task('t3'))?.projectId, 'pOther');
  assert.deepEqual([...(grouping.linkedKeys as string[])].sort(), [
    'synced/s1',
    'tasks/t1',
    'tasks/t2',
  ]);
  const execution = (
    await firestore.doc(`${base(U)}/executions/relate-${grouping.id}`).get()
  ).data();
  assert.equal(execution?.actor, 'nomos');
  assert.equal(execution?.category, 'organize');
  assert.equal(execution?.state, 'succeeded');
  assert.ok(
    (execution?.effectRefs as { collection: string }[]).some(
      (ref) => ref.collection === 'groupings',
    ),
  );
});

test('a certain answer that touches a thing with a link is only proposed and writes no link', async () => {
  await setup();
  await runNight([
    {
      sources: [taskAlias('t1'), taskAlias('t3'), syncedAlias('s1')],
      parent: projectAlias('pMove'),
      confidence: 'certain',
    },
  ]);
  const [grouping] = await groupings();
  assert.equal(grouping.state, 'proposed');
  assert.equal(grouping.confidence, 'likely');
  assert.equal((await task('t1'))?.projectId, null);
  assert.equal((await task('t3'))?.projectId, 'pOther');
});

test('a likely answer and a thing that fails the code check are proposals with no link', async () => {
  await setup();
  await runNight([
    {
      sources: [taskAlias('t4'), syncedAlias('s1')],
      parent: projectAlias('pMove'),
      confidence: 'certain',
    },
  ]);
  const [grouping] = await groupings();
  assert.equal(grouping.state, 'proposed');
  assert.equal((await task('t4'))?.projectId, null);
  assert.equal(
    (await firestore.doc(`${base(U)}/executions/relate-${grouping.id}`).get())
      .exists,
    false,
  );
});

test('a task forces a project, so a topic parent becomes a new project to make', async () => {
  await setup();
  await firestore.doc(`${base(U)}/topics/tp1`).set({
    parentId: null,
    projectIds: [],
    privacy: 'ordinary',
    sealed: sealForHelm(keyFor(U), { name: 'House' }),
  });
  await runNight([
    {
      sources: [taskAlias('t4'), syncedAlias('s1')],
      parent: toAlias('t', U, 'tp1'),
      parentKind: 'topic',
      proposedTitle: 'Moving house',
    },
  ]);
  const [grouping] = await groupings();
  assert.equal(grouping.parentKind, 'project');
  assert.equal(grouping.parentId, null);
});

test('a care item is never sent and a private one goes without its words', async () => {
  await setup();
  const key = keyFor(U);
  await firestore.doc(`${base(U)}/tasks/care1`).set({
    status: 'open',
    projectId: null,
    whoIds: [],
    due: null,
    privacy: 'private',
    completedAt: null,
    sealed: sealForHelm(key, { title: 'Take insulin', privateMark: 'care' }),
  });
  await firestore.doc(`${base(U)}/notes/priv1`).set({
    topicIds: [],
    projectIds: [],
    privacy: 'private',
    createdAt: NOW - DAY_MS,
    sealed: sealForHelm(key, {
      title: 'Therapy plan',
      body: 'x',
      privateMark: 'person',
    }),
  });
  await runNight([
    {
      sources: [noteAlias('priv1'), syncedAlias('s1')],
      parent: projectAlias('pMove'),
      confidence: 'certain',
    },
    { sources: [taskAlias('care1'), syncedAlias('s1')], proposedTitle: 'Care' },
  ]);
  const sent = prompts.join('');
  ['Take insulin', 'care1', 'Therapy', 'priv1', 'secret body', 'Dana'].forEach(
    (text) =>
      assert.ok(!sent.includes(text), `the request never carries ${text}`),
  );
  assert.ok(
    sent.includes(noteAlias('priv1')),
    'a private note is there by code',
  );
  const stored = await groupings();
  assert.equal(stored.length, 1, 'the care grouping is refused');
  assert.equal(
    stored[0].state,
    'proposed',
    'a private thing is never filed quietly',
  );
  assert.equal(stored[0].privacy, 'private');
  assert.deepEqual(Object.keys(wordsOf(stored[0]).titles), ['synced/s1']);
});

test('Not related persists, and only a new thing reopens it', async () => {
  await setup();
  const keys = ['tasks/t4', 'synced/s1'];
  const id = await storeGrouping(keys, 'notRelated', { answeredAt: NOW });
  const entry = {
    sources: [taskAlias('t4'), syncedAlias('s1')],
    proposedTitle: 'Moving',
  };
  await runNight([entry]);
  assert.equal((await groupings())[0].state, 'notRelated');
  await runNight([{ ...entry, sources: [...entry.sources, taskAlias('t1')] }]);
  const [reopened] = await groupings();
  assert.equal(reopened.id, id, 'the same grouping, not a second one');
  assert.equal(reopened.state, 'proposed');
  assert.equal(reopened.sourceKeys.length, 3);
});

test('an ended Not now reopens only for a new thing, an unended one keeps waiting', async () => {
  await setup();
  const id = await storeGrouping(['tasks/t4', 'synced/s1'], 'notNow', {
    declineCount: 3,
    nextOfferAfter: null,
  });
  await runNight([
    {
      sources: [taskAlias('t4'), syncedAlias('s1'), taskAlias('t1')],
      proposedTitle: 'Moving',
    },
  ]);
  const [reopened] = await groupings();
  assert.equal(reopened.id, id);
  assert.equal(reopened.state, 'proposed');
  assert.equal(reopened.declineCount, 0);
});

test('a source that is gone is dropped from a stored grouping, and one left with fewer than two goes', async () => {
  await setup();
  const kept = await storeGrouping(
    ['tasks/t4', 'tasks/t1', 'synced/s1'],
    'proposed',
  );
  const lost = await storeGrouping(['tasks/gone1', 'tasks/gone2'], 'proposed');
  await firestore.doc(`${base(U)}/tasks/t1`).delete();
  await runNight([]);
  const stored = await groupings();
  assert.deepEqual(
    stored.map((grouping) => grouping.id),
    [kept],
  );
  assert.deepEqual([...stored[0].sourceKeys].sort(), ['synced/s1', 'tasks/t4']);
  assert.ok(!stored.some((grouping) => grouping.id === lost));
});

test('a night writes only under the person and its own run records', async () => {
  await setup();
  await setup({ uid: OTHER });
  await firestore.doc(base(OTHER)).update({ relateDueAt: null });
  const before = await snapshotAll();
  const otherBefore = (await firestore.doc(base(OTHER)).get()).data();
  await runNight([
    {
      sources: [taskAlias('t1'), taskAlias('t2'), syncedAlias('s1')],
      parent: projectAlias('pMove'),
      confidence: 'certain',
    },
  ]);
  const after = await snapshotAll();
  const changed = Object.keys(after).filter(
    (path) => before[path] !== after[path],
  );
  assert.ok(changed.length > 0);
  changed.forEach((path) =>
    assert.ok(path.startsWith(`${base(U)}/`), `${path} is the person's own`),
  );
  const paths = (await firestore.collectionGroup('groupings').get()).docs.map(
    (doc: { ref: { path: string } }) => doc.ref.path,
  );
  paths.forEach((path: string) =>
    assert.ok(path.startsWith(`${base(U)}/groupings/`)),
  );
  assert.deepEqual(
    (await firestore.doc(base(OTHER)).get()).data(),
    otherBefore,
  );
  assert.equal((await groupings(OTHER)).length, 0);
});

test('related things come from stored groupings and carry no private title', async () => {
  await setup();
  const key = keyFor(U);
  const id = await storeGrouping(
    ['tasks/t4', 'synced/s1', 'notes/n1'],
    'proposed',
    {
      sources: [
        { key: 'tasks/t4', app: null, kind: 'task' },
        { key: 'synced/s1', app: 'app:runway', kind: 'project' },
        { key: 'notes/n1', app: null, kind: 'note' },
      ],
      sealed: sealForHelm(key, {
        proposedTitle: 'Moving',
        emoji: null,
        titles: { 'tasks/t4': 'Book a plumber', 'synced/s1': 'Moving fund' },
      }),
    },
  );
  await storeGrouping(['tasks/t1', 'tasks/t2'], 'notRelated');
  const things = await readContextRelatedThings(
    firestore,
    base(U),
    key,
    'how is the moving going',
    false,
  );
  assert.deepEqual(
    things.map((thing: { name: string; state: string }) => [
      thing.name,
      thing.state,
    ]),
    [['Moving', 'suggested']],
  );
  assert.deepEqual(
    things[0].sources.map((source: { title: string | null }) => source.title),
    ['Book a plumber', 'Moving fund', null],
  );
  assert.equal(
    (await readContextRelatedThings(firestore, base(U), key, 'buy milk', false))
      .length,
    0,
  );
  const message = buildContext({
    text: 'how is the moving going',
    reading: {
      people: [],
      places: [],
      documents: [],
      commands: [],
      isUrgent: false,
      dates: [],
      addressedAs: null,
    },
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    relatedThings: things,
  }).message;
  assert.ok(message.includes('<related_things>'));
  assert.ok(!message.includes(id), 'no grouping id is shown');
  assert.ok(readGrouping(id, (await groupings())[0]));
});

const failures: string[] = [];
await clean();
await tests.reduce(async (previous, [name, run]) => {
  await previous;
  await clean();
  prompts.length = 0;
  night = 0;
  await run().then(
    () => console.log(`ok   ${name}`),
    (error) => {
      failures.push(name);
      console.log(
        `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
      );
    },
  );
}, Promise.resolve());
await clean();
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length === 0 ? 0 : 1);
