import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { createRequire } from 'node:module';

import {
  openWithKey,
  type SealedPayload,
} from '../../functions/src/appKeys/seal.ts';
import { gcmEncrypt } from '../../functions/src/appKeys/gcm.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  toReading,
  MAX_MEDIA_TARGETS,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planMediaDecisions,
  planWrites,
  type MediaInput,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { pickRoute } from '../../functions/src/apps/helm/nomos/route.ts';
import { sealForHelm } from '../../functions/src/apps/helm/helmKey.ts';
import {
  LET_GO_WINDOW_MS,
  MAX_ATTACHMENTS_PER_TURN,
  MEDIA_CAPTION_CAP,
} from '../../functions/src/apps/helm/media/mediaCaps.ts';
import {
  choosePhotos,
  mediaObjectPath,
  openMedia,
  type MediaBucket,
  type MediaRow,
} from '../../functions/src/apps/helm/media/openMedia.ts';
import { sweepExpiredMedia } from '../../functions/src/apps/helm/media/sweepMedia.ts';

// sharp is a dependency of the functions package only.
const sharp = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)('sharp') as (input: Buffer | { create: object }) => {
  png(): { toBuffer(): Promise<Buffer> };
  metadata(): Promise<{ format?: string; width?: number }>;
};

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const key = { keyId: 'k1', keyVersion: 1, key: randomBytes(32) };
const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);

const normalize = (raw: unknown, photoAliases = ['m1', 'm2', 'm3']) => {
  const aliases = createAliasBook('t');
  const facts = createAliasBook('f');
  aliases.add('task-venue');
  facts.add('fact-one');
  return normalizeNomosReply(raw, {
    reading: toReading({}),
    aliases,
    facts,
    photoAliases,
  });
};

const makeTask = {
  kind: 'createTask',
  ref: '$new1',
  title: 'Book the venue',
  taskAlias: null,
  dueSpanId: null,
  isUrgent: null,
  whoRefs: [],
  placeRefs: [],
  projectRef: null,
};

test('an unknown or repeated alias is dropped, and every photo gets one decision', () => {
  const reply = normalize({
    commands: [makeTask],
    media: [
      { alias: 'm1', decision: 'keep', caption: 'Quote', attachTo: ['t1'] },
      { alias: 'm1', decision: 'discard', caption: null, attachTo: [] },
      { alias: 'm9', decision: 'keep', caption: 'x', attachTo: ['t1'] },
    ],
  });
  assert.deepEqual(reply.mediaDropped, ['repeatedAlias', 'unknownAlias']);
  assert.deepEqual(
    reply.media.map((entry) => [entry.alias, entry.decision]),
    [
      ['m1', 'keep'],
      ['m2', 'discard'],
      ['m3', 'discard'],
    ],
  );
  assert.deepEqual(reply.media[0].targets, [
    { kind: 'task', ref: 'task-venue' },
  ]);
});

test('a caption is cut to 200 characters', () => {
  const reply = normalize({
    commands: [],
    media: [
      {
        alias: 'm1',
        decision: 'keep',
        caption: 'word '.repeat(80),
        attachTo: ['f1'],
      },
    ],
  });
  assert.ok((reply.media[0].caption ?? '').length <= MEDIA_CAPTION_CAP);
  assert.ok((reply.media[0].caption ?? '').length > 150);
  assert.deepEqual(reply.media[0].targets, [{ kind: 'fact', ref: 'fact-one' }]);
});

test('a keep with no target that resolves becomes a discard', () => {
  const reply = normalize({
    commands: [makeTask],
    media: [
      { alias: 'm1', decision: 'keep', caption: 'A', attachTo: [] },
      {
        alias: 'm2',
        decision: 'keep',
        caption: 'B',
        attachTo: ['t9', '$new4'],
      },
      { alias: 'm3', decision: 'keep', caption: 'C', attachTo: ['$new1'] },
    ],
  });
  assert.deepEqual(
    reply.media.map((entry) => entry.decision),
    ['discard', 'discard', 'keep'],
  );
  assert.equal(reply.media[0].caption, null);
  assert.deepEqual(reply.media[2].targets, [{ kind: 'task', ref: '$new1' }]);
});

test('a photo the model left out is let go, and no photos means no decisions', () => {
  const reply = normalize({ commands: [], media: [] }, ['m1', 'm2']);
  assert.deepEqual(
    reply.media.map((entry) => entry.decision),
    ['discard', 'discard'],
  );
  assert.deepEqual(normalize({ commands: [] }, []).media, []);
});

test('a keep names at most the target cap, each record once', () => {
  const reply = normalize({
    commands: [makeTask],
    media: [
      {
        alias: 'm1',
        decision: 'keep',
        caption: 'A',
        attachTo: ['t1', 't1', 'f1', '$new1', 't1'],
      },
    ],
  });
  assert.equal(reply.media[0].targets.length, MAX_MEDIA_TARGETS);
});

test('a turn with photos takes the full route, even a short one', () => {
  assert.equal(pickRoute({ text: 'Add milk', mode: 'full' }), 'quick');
  assert.equal(pickRoute({ text: '', mode: 'full', hasMedia: true }), 'full');
});

const row = (extra: Partial<MediaRow> = {}): MediaRow => ({
  kind: 'photo',
  status: 'received',
  sourceCaptureId: 'cap-1',
  ...extra,
});

test('only photos attached to this capture are read, each once', () => {
  const rows = new Map<string, MediaRow | undefined>([
    ['mine', row()],
    ['theirs', row({ sourceCaptureId: 'cap-2' })],
    ['unsent', row({ sourceCaptureId: null })],
    ['kept', row({ status: 'kept' })],
    ['file', row({ kind: 'file' })],
  ]);
  const chosen = choosePhotos(
    ['mine', 'mine', 'theirs', 'unsent', 'kept', 'file', 'gone', 7, 'bad id!'],
    'cap-1',
    rows,
  );
  assert.deepEqual(chosen, { ids: ['mine'], refused: [] });
});

test('a sixth photo is refused', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const chosen = choosePhotos(
    ids,
    'cap-1',
    new Map(ids.map((id) => [id, row()])),
  );
  assert.equal(MAX_ATTACHMENTS_PER_TURN, 5);
  assert.deepEqual(chosen.ids, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(chosen.refused, ['f']);
});

const fakeStore = (docs: Record<string, Record<string, unknown>>) => {
  const log: string[] = [];
  const snapshot = (path: string) => ({
    id: path.split('/').pop() as string,
    data: () => docs[path],
    get: (field: string) => docs[path]?.[field],
    ref: {
      delete: async () => {
        log.push(`doc:${path}`);
        delete docs[path];
      },
    },
  });
  const firestore = {
    doc: (path: string) => ({ path }),
    getAll: async (...refs: { path: string }[]) =>
      refs.map((ref) => snapshot(ref.path)),
    collection: (path: string) => {
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({
          docs: Object.keys(docs)
            .filter((entry) => entry.startsWith(`${path}/`))
            .map(snapshot),
        }),
      };
      return query;
    },
  };
  return { firestore, log };
};

const BASE = 'apps/helm/users/u1';

test('a photo opens as one 1600 px copy; one that will not open is let go', async () => {
  const png = await sharp({
    create: {
      width: 2400,
      height: 1200,
      channels: 3,
      background: { r: 40, g: 90, b: 160 },
    },
  })
    .png()
    .toBuffer();
  const sealedFor = (bytes: Buffer) => {
    const { ciphertext, nonce } = gcmEncrypt(key.key, bytes, null);
    return {
      bytes: Buffer.from(ciphertext, 'base64'),
      sealed: seal({ bytesNonce: nonce, thumbNonce: null, keyId: key.keyId }),
    };
  };
  const good = sealedFor(png);
  const bad = sealedFor(Buffer.from('not an image'));
  const { firestore } = fakeStore({
    [`${BASE}/media/good`]: { ...row(), sealed: good.sealed },
    [`${BASE}/media/bad`]: { ...row(), sealed: bad.sealed },
    [`${BASE}/media/other`]: {
      ...row({ sourceCaptureId: 'cap-2' }),
      sealed: good.sealed,
    },
  });
  const objects: Record<string, Buffer> = {
    [mediaObjectPath('u1', 'good')]: good.bytes,
    [mediaObjectPath('u1', 'bad')]: bad.bytes,
    [mediaObjectPath('u1', 'other')]: good.bytes,
  };
  const bucket: MediaBucket = {
    file: (path) => ({
      download: async () => [objects[path]],
      delete: async () => undefined,
    }),
  };
  const opened = await openMedia({
    firestore: firestore as never,
    bucket,
    base: BASE,
    uid: 'u1',
    key,
    captureId: 'cap-1',
    listed: ['good', 'bad', 'other'],
  });
  assert.deepEqual(
    opened.photos.map((photo) => [photo.id, photo.alias]),
    [['good', 'm1']],
  );
  assert.deepEqual(opened.unopened, ['bad']);
  assert.equal(opened.photos[0].block.type, 'image');
  const block = opened.photos[0].block;
  const data = block.type === 'image' ? block.data : '';
  const meta = await sharp(Buffer.from(data, 'base64')).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 1600);
});

const photos = new Map([
  ['m1', { id: 'p1', words: { bytesNonce: 'n', keyId: 'k1' } }],
  ['m2', { id: 'p2', words: { bytesNonce: 'n', keyId: 'k1' } }],
]);
const NOW = Date.UTC(2026, 10, 9, 12);

const plan = (decisions: MediaInput['decisions'], room = 40) =>
  planMediaDecisions({
    media: {
      decisions,
      photos,
      letGoIds: ['p3'],
      titles: new Map([['task:task-venue', 'Book the venue']]),
      executionId: 'ex1',
    },
    resolve: (target) =>
      target.ref === 'task-venue'
        ? { id: 'task-venue', title: 'Book the venue' }
        : null,
    room,
    now: NOW,
    seal,
  });

test('a keep is one media update effect that Undo can read back', () => {
  const made = plan([
    {
      alias: 'm1',
      decision: 'keep',
      caption: 'The quote',
      targets: [{ kind: 'task', ref: 'task-venue' }],
    },
    { alias: 'm2', decision: 'discard', caption: null, targets: [] },
  ]);
  assert.deepEqual(made.effectRefs, [
    { op: 'update', collection: 'media', docId: 'p1' },
  ]);
  const [effect] = made.effects;
  assert.equal(effect.written['sealed.title'], 'Book the venue');
  assert.equal(effect.previous?.['sealed.title'], 'Book the venue');
  assert.equal(effect.written.status, 'kept');
  assert.equal(effect.previous?.status, 'received');
  assert.deepEqual(effect.written.attachedTo, [
    { kind: 'task', id: 'task-venue' },
  ]);
  assert.equal(made.kept[0].data.deleteAfter, null);
  assert.equal(made.kept[0].data.executionId, 'ex1');
});

test('a photo let go is written for a day and is never an effect', () => {
  const made = plan([
    { alias: 'm1', decision: 'discard', caption: null, targets: [] },
    {
      alias: 'm2',
      decision: 'keep',
      caption: 'x',
      targets: [{ kind: 'task', ref: '$new9' }],
    },
  ]);
  assert.equal(made.effects.length, 0);
  assert.deepEqual(
    made.letGo.map((entry) => entry.id),
    ['p1', 'p2', 'p3'],
  );
  made.letGo.forEach((entry) => {
    assert.equal(entry.data.status, 'discarded');
    assert.equal(entry.data.deleteAfter, NOW + LET_GO_WINDOW_MS);
  });
});

test('a keep that has no room left is let go', () => {
  const made = plan(
    [
      {
        alias: 'm1',
        decision: 'keep',
        caption: 'x',
        targets: [{ kind: 'task', ref: 'task-venue' }],
      },
    ],
    0,
  );
  assert.equal(made.kept.length, 0);
  assert.equal(made.letGo[0].id, 'p1');
});

test('a keep on a task this reply makes lands on its new id, in the turn summary', () => {
  const existing = new Map();
  const written = planWrites({
    commands: [
      {
        kind: 'createTask',
        ref: '$new1',
        title: 'Book the venue',
        due: null,
        isUrgent: false,
        whoRefs: [],
        placeRefs: [],
        projectRef: null,
      },
    ],
    existing,
    captureId: 'cap-1',
    executionId: 'ex1',
    now: NOW,
    seal,
    newId: () => 'new-task',
    media: {
      decisions: [
        {
          alias: 'm1',
          decision: 'keep',
          caption: 'The quote',
          targets: [{ kind: 'task', ref: '$new1' }],
        },
      ],
      photos,
      letGoIds: [],
      titles: new Map(),
      executionId: 'ex1',
    },
  });
  assert.deepEqual(written.mediaKept[0].data.attachedTo, [
    { kind: 'task', id: 'new-task' },
  ]);
  assert.equal(
    written.effectRefs.filter((ref) => ref.collection === 'media').length,
    1,
  );
  const execution = buildExecution(written, {
    captureId: 'cap-1',
    now: NOW,
    seal,
    commands: [],
  });
  const summary = openWithKey(
    key.key,
    execution.sealed as SealedPayload,
  ).summary;
  assert.match(String(summary), /Kept the photo on Book the venue/);
});

test('the sweep keeps a let-go photo until 24 hours pass, then deletes objects before the document', async () => {
  const letGoAt = NOW;
  const docs: Record<string, Record<string, unknown>> = {
    [`${BASE}/media/p1`]: {
      status: 'discarded',
      deleteAfter: letGoAt + LET_GO_WINDOW_MS,
    },
    [`${BASE}/media/p2`]: { status: 'received', deleteAfter: null },
  };
  const { firestore, log } = fakeStore(docs);
  const bucket: MediaBucket = {
    file: (path) => ({
      download: async () => [Buffer.alloc(0)],
      delete: async (options) => {
        assert.equal(options?.ignoreNotFound, true);
        log.push(`object:${path}`);
      },
    }),
  };
  const sweep = (now: number) =>
    sweepExpiredMedia({
      firestore: firestore as never,
      bucket,
      uid: 'u1',
      now,
    });
  const early = await sweep(letGoAt + LET_GO_WINDOW_MS - 1);
  assert.deepEqual(early, { deleted: 0, failed: 0 });
  assert.deepEqual(log, []);
  const due = await sweep(letGoAt + LET_GO_WINDOW_MS);
  assert.deepEqual(due, { deleted: 1, failed: 0 });
  assert.deepEqual(log, [
    'object:apps/helm/media/u1/p1',
    'object:apps/helm/media/u1/p1.thumb',
    `doc:${BASE}/media/p1`,
  ]);
  assert.ok(`${BASE}/media/p2` in docs);
});

test('a sweep that cannot delete an object leaves the document', async () => {
  const docs: Record<string, Record<string, unknown>> = {
    [`${BASE}/media/p1`]: { status: 'uploading', deleteAfter: NOW },
  };
  const { firestore } = fakeStore(docs);
  const bucket: MediaBucket = {
    file: () => ({
      download: async () => [Buffer.alloc(0)],
      delete: async () => {
        throw new Error('storage down');
      },
    }),
  };
  const result = await sweepExpiredMedia({
    firestore: firestore as never,
    bucket,
    uid: 'u1',
    now: NOW,
  });
  assert.deepEqual(result, { deleted: 0, failed: 1 });
  assert.ok(`${BASE}/media/p1` in docs);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
