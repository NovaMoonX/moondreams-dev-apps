// The nightly reflection against the Firestore emulator with the fake batch client: `npm run check:helm-reflection`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The functions' own copy of the SDK, so the sentinels the server code writes are the classes this client expects.
const fn = '../../functions/node_modules';
const { getApps, initializeApp } = await import(
  `${fn}/firebase-admin/lib/app/index.js`
);
const { getFirestore } = await import(
  `${fn}/firebase-admin/lib/firestore/index.js`
);

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-helm-reflection';
if (getApps().length === 0)
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const firestore = getFirestore();

const { runHelmReflectionPass } =
  await import('../../functions/src/apps/helm/reflection/runHelmReflection.ts');
const { applyReflectionOutcome } =
  await import('../../functions/src/apps/helm/reflection/writeReflection.ts');
const { toAlias } =
  await import('../../functions/src/apps/helm/reflection/buildReflectRequest.ts');
const { removeFromOpenRuns, RUNS_PATH, statePath } =
  await import('../../functions/src/apps/helm/reflection/reflectionRuns.ts');
const { createFakeBatchClient } =
  await import('../../functions/src/ai/providers/fakeBatches.ts');
const { DEV_KEYRING } = await import('../../functions/src/appKeys/keyring.ts');
const { wrapDataKey } = await import('../../functions/src/appKeys/wrap.ts');
const { deriveSeedDataKey, openForHelm, sealForHelm, wrappedKeyPath } =
  await import('../../functions/src/apps/helm/helmKey.ts');
const { whyFingerprint } =
  await import('../../functions/src/apps/helm/goalWhy.ts');

type Fixture = Parameters<typeof createFakeBatchClient>[0][number];

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, run: () => Promise<void>) =>
  tests.push([name, run]);

const NOW = Date.parse('2026-11-10T10:00:00Z');
const HOUR = 3_600_000;
const DAY = '2026-11-10';
const U = 'reflect-user';
const base = (uid: string) => `apps/helm/users/${uid}`;
const keyFor = (uid: string) => ({
  ...deriveSeedDataKey(DEV_KEYRING, uid),
  keyVersion: 1,
});

const clean = () => firestore.recursiveDelete(firestore.collection('apps'));

interface Setup {
  uid?: string;
  days?: string[];
  isCare?: boolean;
  isLearningOn?: boolean;
  note?: string;
  goalWhy?: string;
}

const setup = async ({
  uid = U,
  days = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
  isCare = false,
  isLearningOn = true,
  note,
  goalWhy,
}: Setup = {}) => {
  const key = keyFor(uid);
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(wrapDataKey(DEV_KEYRING, uid, key, NOW));
  await firestore.doc(base(uid)).set({
    timeZone: 'UTC',
    isLearningOn,
    reflectDueAt: NOW - HOUR,
    forgottenAt: null,
    selfWhoId: null,
  });
  await firestore.doc(`${base(uid)}/who/w1`).set({
    isSelf: false,
    kind: 'person',
    sealed: sealForHelm(key, { name: 'Dana', aliases: [] }),
  });
  await firestore.doc(`${base(uid)}/habits/hab1`).set({
    status: 'active',
    isCare,
    createdAt: NOW - 30 * 24 * HOUR,
    sealed: sealForHelm(key, { name: 'Guitar practice' }),
  });
  await Promise.all(
    days.map((dayKey, index) =>
      firestore.doc(`${base(uid)}/observations/obs${index}`).set({
        subject: { collection: 'habits', id: 'hab1' },
        dayKey,
        at: Date.parse(`${dayKey}T20:00:00Z`),
        source: 'turn',
        sourceKeys: [`captures/c${index}`],
        isCare,
        writtenBy: 'turn',
        createdAt: Date.parse(`${dayKey}T20:00:00Z`),
        privacy: isCare ? 'private' : 'ordinary',
        sealed: sealForHelm(key, {
          kind: 'feeling',
          tags: ['tired'],
          quote: index === 0 ? 'too tired to play, ask Dana' : null,
        }),
      }),
    ),
  );
  if (note)
    await firestore.doc(`${base(uid)}/habitDays/2026-11-09`).set({
      date: Date.parse('2026-11-09T00:00:00Z'),
      isInUse: true,
      entries: {},
      sealed: sealForHelm(key, {
        notes: {
          'hab1/w1': {
            text: note,
            at: Date.parse('2026-11-09T21:00:00Z'),
            captureId: null,
          },
        },
      }),
    });
  if (goalWhy)
    await firestore.doc(`${base(uid)}/projects/goal1`).set({
      status: 'active',
      kind: 'goal',
      privacy: 'ordinary',
      createdAt: NOW - 20 * 24 * HOUR,
      sealed: sealForHelm(key, {
        name: 'Play a song',
        why: { verbatim: goalWhy, summary: null, tags: [], basedOn: '' },
      }),
    });
  return days.map((_, index) => `obs${index}`);
};

const candidate = (ids: string[], uid = U) => ({
  subject: toAlias('h', uid, 'hab1'),
  observations: ids.map((id) => toAlias('o', uid, id)),
  tags: ['tired'],
  linkedTo: 'weekday',
  suggestion: 'differentTime',
});
const answer = (json: Record<string, unknown>): Fixture => ({
  type: 'answer',
  json: { candidates: [], whyRefresh: [], noteObservations: [], ...json },
  usage: {
    inputTokens: 4000,
    outputTokens: 300,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
});

const rehearse = (fixtures: Fixture[]) => {
  const client = createFakeBatchClient(fixtures);
  const prompts: string[] = [];
  const create = client.create.bind(client);
  client.create = (params) => {
    prompts.push(...params.requests.map((r) => JSON.stringify(r.params)));
    return create(params);
  };
  return { client, prompts };
};

const pass = (client: ReturnType<typeof rehearse>['client'], hours: number) =>
  runHelmReflectionPass(firestore, client, DEV_KEYRING, NOW + hours * HOUR);

const reflection = async (uid = U) => {
  const snap = await firestore.doc(`${base(uid)}/reflections/${DAY}`).get();
  return snap.exists
    ? {
        data: snap.data() ?? {},
        sealed: openForHelm(keyFor(uid), snap.get('sealed')) as {
          candidates: { suggestion: string; observationIds: string[] }[];
          whyRefresh: { projectId: string; summary: string }[];
        },
      }
    : null;
};
const profile = async (uid = U) =>
  (await firestore.doc(base(uid)).get()).data();
const state = async (uid = U) =>
  (await firestore.doc(statePath(uid)).get()).data();
const runs = async () =>
  (await firestore.collection(RUNS_PATH).get()).docs.map(
    (doc: { id: string; data: () => object }) => ({
      id: doc.id,
      ...doc.data(),
    }),
  ) as { id: string; status: string; requests: Record<string, unknown> }[];
const budget = async () =>
  (await firestore.doc('apps/helm/aiBudget/2026-11-10').get()).get(
    'hundredthsOfCent',
  ) as number | undefined;

test('submit, then collect, writes the reflection and clears what was due', async () => {
  const ids = await setup();
  const { client, prompts } = rehearse([
    answer({ candidates: [candidate(ids)] }),
  ]);
  assert.deepEqual(await pass(client, 0), {
    collected: 0,
    lost: 0,
    submitted: 1,
  });
  assert.equal((await runs())[0].status, 'submitted');
  assert.equal((await state())?.attempts, 0);
  assert.equal(
    (await profile())?.reflectDueAt,
    NOW - HOUR,
    'still due until read',
  );
  assert.deepEqual(await pass(client, 1), {
    collected: 1,
    lost: 0,
    submitted: 0,
  });
  const written = await reflection();
  assert.equal(written?.data.candidateCount, 1);
  assert.equal(written?.data.reflectionId, client.created[0].customIds[0]);
  assert.equal(written?.data.seenAt, null);
  assert.equal(written?.sealed.candidates[0].suggestion, 'differentTime');
  assert.equal((await profile())?.reflectDueAt, null);
  assert.equal((await runs())[0].status, 'collected');
  assert.deepEqual(client.deleted, ['fake_batch_1']);
  assert.equal((await state())?.leaseUntil, 0);
  const sent = prompts.join('');
  ['hab1', 'obs0', 'Dana', 'w1', U].forEach((text) =>
    assert.ok(!sent.includes(text), `the request never carries ${text}`),
  );
  assert.ok(sent.includes('someone'), 'a name of another person is masked');
});

test('learning turned off after sending drops the answer', async () => {
  const ids = await setup();
  const { client } = rehearse([answer({ candidates: [candidate(ids)] })]);
  await pass(client, 0);
  await firestore.doc(base(U)).update({ isLearningOn: false });
  await pass(client, 1);
  assert.equal(await reflection(), null);
  assert.equal((await state())?.leaseUntil, 0);
});

test('learning off before sending sends nothing and clears the due time', async () => {
  await setup({ isLearningOn: false });
  const { client } = rehearse([]);
  assert.equal((await pass(client, 0)).submitted, 0);
  assert.equal((await profile())?.reflectDueAt, null);
});

test('Forget after sending drops the answer', async () => {
  const ids = await setup();
  const { client } = rehearse([answer({ candidates: [candidate(ids)] })]);
  await pass(client, 0);
  await firestore.doc(base(U)).update({ forgottenAt: NOW + 1 });
  await pass(client, 1);
  assert.equal(await reflection(), null);
  assert.equal((await profile())?.reflectDueAt, null);
});

test('an answer to a replaced request is dropped and leaves the newer one alone', async () => {
  const ids = await setup();
  const { client } = rehearse([answer({ candidates: [candidate(ids)] })]);
  await pass(client, 0);
  await firestore.doc(statePath(U)).update({ customId: 'b_newer' });
  await pass(client, 1);
  assert.equal(await reflection(), null);
  assert.equal((await state())?.customId, 'b_newer');
});

test('collecting the same answer again changes nothing and counts nothing twice', async () => {
  const ids = await setup();
  const fixture = answer({ candidates: [candidate(ids)] });
  const { client } = rehearse([fixture]);
  await pass(client, 0);
  const [run] = await runs();
  const customId = client.created[0].customIds[0];
  await pass(client, 1);
  const first = (await reflection())?.data;
  const spent = await budget();
  const outcome = {
    kind: 'answer' as const,
    json: (fixture as { json: unknown }).json,
    usage: (fixture as unknown as { usage: never }).usage,
  };
  assert.equal(
    await applyReflectionOutcome(firestore, DEV_KEYRING, {
      runId: run.id,
      customId,
      outcome,
      now: NOW + 2 * HOUR,
    }),
    'skipped',
  );
  assert.deepEqual((await reflection())?.data, first);
  assert.equal(await budget(), spent);
  await firestore.doc(`${RUNS_PATH}/${run.id}`).update({
    [`requests.${customId}`]: {
      uid: U,
      dayKey: DAY,
      answersDueAt: NOW - HOUR,
      reserved: 0,
    },
  });
  await firestore.doc(statePath(U)).set({
    runId: run.id,
    customId,
    answersDueAt: NOW - HOUR,
    attempts: 0,
    leaseUntil: NOW + HOUR,
    continuation: null,
  });
  await applyReflectionOutcome(firestore, DEV_KEYRING, {
    runId: run.id,
    customId,
    outcome,
    now: NOW + 3 * HOUR,
  });
  assert.deepEqual(
    (await reflection())?.data,
    first,
    'the same request id writes nothing new',
  );
});

test('a candidate on fewer than three days is rejected', async () => {
  const ids = await setup({ days: ['2026-11-08', '2026-11-09', '2026-11-09'] });
  const { client } = rehearse([answer({ candidates: [candidate(ids)] })]);
  await pass(client, 0);
  await pass(client, 1);
  assert.equal((await reflection())?.data.candidateCount, 0);
});

test('a care item is noticed but never suggested a change', async () => {
  const ids = await setup({ isCare: true });
  const { client, prompts } = rehearse([
    answer({ candidates: [candidate(ids)] }),
  ]);
  await pass(client, 0);
  await pass(client, 1);
  const written = await reflection();
  assert.equal(written?.sealed.candidates[0].suggestion, 'none');
  assert.equal(written?.data.privacy, 'private');
  assert.ok(!prompts.join('').includes('Guitar'), 'a care name is not sent');
});

test('three failed tries give up, clear the due time and log it', async () => {
  await setup();
  const { client } = rehearse([]);
  const logged: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    logged.push(String(chunk));
    return write(chunk);
  }) as typeof process.stderr.write;
  const results = await [1, 2, 3, 4].reduce<Promise<number[]>>(
    async (previous, hours) => {
      const seen = await previous;
      await pass(client, hours - 1);
      return [...seen, (await state())?.attempts as number];
    },
    Promise.resolve([]),
  );
  process.stderr.write = write;
  assert.deepEqual(results, [0, 1, 2, 0]);
  assert.equal((await profile())?.reflectDueAt, null);
  assert.ok(logged.join('').includes('helm.reflect.gaveUp'));
  assert.equal(
    client.created.length,
    3,
    'one send a try, none after giving up',
  );
  assert.equal(await reflection(), null);
});

test('a run stuck creating is lost and its people are sent again', async () => {
  await setup();
  await firestore.doc(`${RUNS_PATH}/run_stuck`).set({
    status: 'creating',
    batchId: null,
    requests: {
      b_old: { uid: U, dayKey: DAY, answersDueAt: NOW - HOUR, reserved: 0 },
    },
    superseded: [],
    createdAt: NOW - 20 * 60_000,
    submittedAt: null,
    collectedAt: null,
    deletedAtProvider: null,
  });
  await firestore.doc(statePath(U)).set({
    runId: 'run_stuck',
    customId: 'b_old',
    answersDueAt: NOW - HOUR,
    attempts: 0,
    leaseUntil: NOW + HOUR,
    continuation: null,
  });
  const { client } = rehearse([answer({})]);
  assert.deepEqual(await pass(client, 0), {
    collected: 0,
    lost: 1,
    submitted: 1,
  });
  const stuck = (await runs()).find((run) => run.id === 'run_stuck');
  assert.equal(stuck?.status, 'lost');
  assert.notEqual((await state())?.customId, 'b_old');
  assert.equal(
    (await profile())?.reflectDueAt,
    NOW - HOUR,
    'the due time was never touched',
  );
});

test('a run still creating inside 15 minutes is left alone', async () => {
  await setup();
  await firestore.doc(`${RUNS_PATH}/run_new`).set({
    status: 'creating',
    batchId: null,
    requests: {},
    superseded: [],
    createdAt: NOW - 60_000,
    submittedAt: null,
    collectedAt: null,
    deletedAtProvider: null,
  });
  const { client } = rehearse([answer({})]);
  assert.equal((await pass(client, 0)).lost, 0);
  assert.equal(
    (await runs()).find((run) => run.id === 'run_new')?.status,
    'creating',
  );
});

test('deleting a person takes them out of open runs, so their answer lands nowhere', async () => {
  const ids = await setup();
  const { client } = rehearse([answer({ candidates: [candidate(ids)] })]);
  await pass(client, 0);
  assert.equal(await removeFromOpenRuns(firestore, U), 1);
  assert.deepEqual((await runs())[0].requests, {});
  await pass(client, 1);
  assert.equal(await reflection(), null);
  const source = readFileSync(
    'functions/src/apps/helm/deleteHelmData.ts',
    'utf8',
  );
  assert.match(source, /removeFromOpenRuns\(firestore, uid\)/);
  assert.ok(
    source.indexOf('removeFromOpenRuns(firestore, uid)') <
      source.indexOf('deleteUserCollections(firestore, uid)'),
    'the runs are cleared before the person tree goes',
  );
});

test('a why summary is kept only while its words are unchanged', async () => {
  const why = 'I want to play at my sister wedding next spring';
  const ids = await setup({ goalWhy: why });
  const goal = toAlias('g', U, 'goal1');
  const { client } = rehearse([
    answer({
      candidates: [candidate(ids)],
      whyRefresh: [
        {
          goal,
          summary: 'Play at the wedding',
          tags: ['family'],
          basedOn: whyFingerprint(why),
        },
        { goal, summary: 'Stale', tags: [], basedOn: 'old' },
      ],
    }),
  ]);
  await pass(client, 0);
  await pass(client, 1);
  const refreshes = (await reflection())?.sealed.whyRefresh;
  assert.equal(refreshes?.length, 1);
  assert.equal(refreshes?.[0].projectId, 'goal1');
  assert.equal(refreshes?.[0].summary, 'Play at the wedding');
});

test('a note observation keeps only a quote found in the note', async () => {
  const note = 'Skipped it, felt flat and tired tonight';
  const ids = await setup({ note });
  const about = toAlias('h', U, 'hab1');
  const { client } = rehearse([
    answer({
      candidates: [candidate(ids)],
      noteObservations: [
        {
          about,
          day: '2026-11-09',
          kind: 'feeling',
          tags: ['tired'],
          quote: 'felt flat and tired',
        },
        {
          about,
          day: '2026-11-09',
          kind: 'feeling',
          tags: ['stressed'],
          quote: 'a made up line',
        },
      ],
    }),
  ]);
  await pass(client, 0);
  await pass(client, 1);
  const made = (
    await firestore.collection(`${base(U)}/observations`).get()
  ).docs.filter(
    (doc: { get: (field: string) => unknown }) =>
      doc.get('writtenBy') === 'reflection',
  );
  assert.equal(made.length, 1);
  assert.equal(made[0].get('source'), 'checkInNote');
  assert.deepEqual(made[0].get('sourceKeys'), ['habitDays/2026-11-09#hab1/w1']);
  assert.equal(
    (openForHelm(keyFor(U), made[0].get('sealed')) as { quote: string }).quote,
    'felt flat and tired',
  );
});

const failures: string[] = [];
await clean();
await tests.reduce(async (previous, [name, run]) => {
  await previous;
  await clean();
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
