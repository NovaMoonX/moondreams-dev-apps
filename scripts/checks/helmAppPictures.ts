// Run against the Firestore emulator: `npm run check:helm-app-pictures`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import { gcmDecrypt } from '../../functions/src/appKeys/gcm.ts';
import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import {
  deriveSeedDataKey,
  unwrapHelmKey,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  createHelmSink,
  openHelmSession,
  toSyncedId,
} from '../../functions/src/apps/helm/connections/sink.ts';
import {
  planPicture,
  readPictureSource,
  syncedPicturePath,
  PICTURE_PX,
  type PictureBucket,
} from '../../functions/src/apps/helm/connections/syncedPictures.ts';
import {
  readPictureLink,
  toGrantId,
  type SharedRecord,
} from '../../functions/src/vendor/connectionsContract.ts';
import { getPosterLink } from '../../src/apps/helm/utils/syncedPictures.ts';
import type { SyncedRecord } from '../../src/apps/helm/types.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FUNCTIONS_EMULATOR = 'true';
if (getApps().length === 0) initializeApp({ projectId: 'demo-app-pictures' });
const firestore = getFirestore();

// sharp is a dependency of the functions package only.
const sharp = createRequire(
  new URL('../../functions/package.json', import.meta.url),
)('sharp') as (input: { create: object }) => {
  jpeg(): { toBuffer(): Promise<Buffer> };
};

const makeJpeg = (shade: number) =>
  sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: shade, g: 80, b: 120 },
    },
  })
    .jpeg()
    .toBuffer();

class FakeBucket {
  objects = new Map<string, { data: Buffer; generation: number }>();
  downloads = 0;
  saves = 0;
  failing = false;
  private generation = 0;
  put(path: string, data: Buffer) {
    this.generation += 1;
    this.objects.set(path, { data, generation: this.generation });
  }
  file(path: string) {
    const find = () => {
      const found = this.objects.get(path);
      if (!found) throw Object.assign(new Error('missing'), { code: 404 });
      return found;
    };
    return {
      getMetadata: async () => {
        if (this.failing) throw new Error('unavailable');
        const found = find();
        return [
          {
            md5Hash: createHash('md5').update(found.data).digest('base64'),
            generation: found.generation,
          },
        ] as [{ md5Hash: string; generation: number }];
      },
      download: async () => {
        this.downloads += 1;
        return [find().data] as [Buffer];
      },
      save: async (data: Buffer) => {
        this.saves += 1;
        this.put(path, data);
      },
      delete: async () => {
        this.objects.delete(path);
      },
    };
  }
}

const GRANT_ID = toGrantId('helm', 'app:nine-lives', 'site');
const CONNECTOR = 'app:nine-lives';
const NOW = Date.UTC(2026, 10, 18, 15);
const DAY = 86_400_000;
const PHOTO = 'nine-lives/households/h1/cats/miso/photo';

const cat = (ref: string, photoPath: string | null): SharedRecord => ({
  sourceRef: ref,
  kind: 'pet',
  title: `Cat ${ref}`,
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
  extra: photoPath === null ? {} : { photoPath },
});

let counter = 0;
const setup = async () => {
  counter += 1;
  const uid = `pictures-user-${counter}-${Date.now()}`;
  await firestore
    .doc(wrappedKeyPath(uid))
    .set(
      wrapDataKey(DEV_KEYRING, uid, deriveSeedDataKey(DEV_KEYRING, uid), NOW),
    );
  const bucket = new FakeBucket();
  const session = openHelmSession(
    firestore,
    uid,
    () => bucket as unknown as PictureBucket,
  );
  const write = (records: SharedRecord[], now = NOW) =>
    session.writePage({
      grantId: GRANT_ID,
      connectorId: CONNECTOR,
      accountId: 'site',
      category: 'cats',
      records,
      isFull: true,
      windowStart: 0,
      now,
      deepLink: () => null,
    });
  const doc = (ref: string) =>
    firestore
      .doc(`apps/helm/users/${uid}/synced/${toSyncedId(GRANT_ID, 'cats', ref)}`)
      .get();
  return {
    uid,
    bucket,
    session,
    write,
    doc,
    path: (ref: string) =>
      syncedPicturePath(uid, toSyncedId(GRANT_ID, 'cats', ref)),
  };
};

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

test('a photo path is read only from the source app’s own Storage area', () => {
  assert.equal(readPictureSource(CONNECTOR, PHOTO), PHOTO);
  assert.equal(readPictureSource(CONNECTOR, 'apps/helm/media/u/m1'), null);
  assert.equal(
    readPictureSource(CONNECTOR, 'nine-lives/households/../../users/x'),
    null,
  );
  assert.equal(readPictureSource('app:pinch', PHOTO), null);
  assert.equal(readPictureSource(CONNECTOR, 42), null);
});

test('a poster is linked only when it is https', () => {
  assert.equal(
    readPictureLink('https://image.example/p.jpg'),
    'https://image.example/p.jpg',
  );
  [
    'http://image.example/p.jpg',
    'javascript:alert(1)',
    '//x/p.jpg',
    null,
    7,
  ].forEach((value) =>
    assert.equal(readPictureLink(value), null, String(value)),
  );
  const record = (posterUrl: unknown) =>
    ({ sealed: { extra: { posterUrl } } }) as unknown as SyncedRecord;
  assert.equal(getPosterLink(record('http://x.example/p.jpg')), null);
  assert.equal(
    getPosterLink(record('https://x.example/p.jpg')),
    'https://x.example/p.jpg',
  );
});

test('the plan copies a new or changed photo, drops a removed one and keeps what it cannot read', () => {
  const stored = {
    hash: 'a',
    nonce: 'n',
    contentType: 'image/webp',
    keyId: 'k',
  };
  assert.equal(planPicture({ status: 'none' }, null), 'none');
  assert.equal(planPicture({ status: 'ok', hash: 'a' }, null), 'copy');
  assert.equal(planPicture({ status: 'ok', hash: 'a' }, stored), 'none');
  assert.equal(planPicture({ status: 'ok', hash: 'b' }, stored), 'copy');
  assert.equal(planPicture({ status: 'none' }, stored), 'delete');
  assert.equal(planPicture({ status: 'unknown' }, stored), 'none');
});

test('a copy is made only for a cat with a photo, small and sealed', async () => {
  const t = await setup();
  t.bucket.put(PHOTO, await makeJpeg(10));
  await t.write([cat('miso', PHOTO), cat('plain', null)]);
  assert.equal(t.bucket.downloads, 1);
  assert.equal(t.bucket.objects.has(t.path('plain')), false);
  const stored = t.bucket.objects.get(t.path('miso'));
  assert.ok(stored, 'the photo has a copy');
  const doc = await t.doc('miso');
  const picture = doc.get('picture');
  assert.equal(picture.contentType, 'image/webp');
  assert.equal((await t.doc('plain')).get('picture'), null);
  const key = await unwrapHelmKey(
    firestore,
    (
      await import('../../functions/src/apps/helm/getHelmKey.ts')
    ).loadHelmKeyring(),
    t.uid,
  );
  assert.equal(picture.keyId, key.keyId);
  const plain = gcmDecrypt(
    key.key,
    stored.data.toString('base64'),
    picture.nonce,
    null,
  );
  assert.equal(plain.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.ok(plain.length < 30_000, 'an avatar, not the full photo');
  assert.ok(PICTURE_PX <= 256);
  assert.equal(
    JSON.stringify(doc.get('sealed')).includes('photoPath'),
    false,
    'the source path is never kept',
  );
  assert.equal(
    (await sourceExtra(t, 'miso')).photoPath,
    undefined,
    'the opened record carries no source path',
  );
});

const sourceExtra = async (
  t: Awaited<ReturnType<typeof setup>>,
  ref: string,
) => {
  const { openForHelm } =
    await import('../../functions/src/apps/helm/helmKey.ts');
  const { loadHelmKeyring } =
    await import('../../functions/src/apps/helm/getHelmKey.ts');
  const key = await unwrapHelmKey(firestore, loadHelmKeyring(), t.uid);
  return openForHelm(key, (await t.doc(ref)).get('sealed')).extra as Record<
    string,
    unknown
  >;
};

test('an unchanged photo is not copied again, a changed one replaces the copy', async () => {
  const t = await setup();
  t.bucket.put(PHOTO, await makeJpeg(10));
  await t.write([cat('miso', PHOTO)]);
  const first = (await t.doc('miso')).get('picture');
  await t.write([cat('miso', PHOTO)], NOW + DAY);
  assert.equal(t.bucket.downloads, 1, 'no second download');
  assert.equal(t.bucket.saves, 1, 'no second save');
  assert.equal((await t.doc('miso')).get('picture').nonce, first.nonce);
  t.bucket.put(PHOTO, await makeJpeg(200));
  await t.write([cat('miso', PHOTO)], NOW + 2 * DAY);
  assert.equal(t.bucket.downloads, 2);
  assert.equal(t.bucket.saves, 2);
  const second = (await t.doc('miso')).get('picture');
  assert.notEqual(second.hash, first.hash);
  assert.notEqual(second.nonce, first.nonce);
});

test('a source that cannot be read keeps the copy', async () => {
  const t = await setup();
  t.bucket.put(PHOTO, await makeJpeg(10));
  await t.write([cat('miso', PHOTO)]);
  t.bucket.failing = true;
  await t.write([cat('miso', PHOTO)], NOW + DAY);
  assert.ok(t.bucket.objects.has(t.path('miso')));
  assert.ok((await t.doc('miso')).get('picture'));
});

test('a removed photo deletes the copy', async () => {
  const t = await setup();
  t.bucket.put(PHOTO, await makeJpeg(10));
  await t.write([cat('miso', PHOTO)]);
  await t.write([cat('miso', null)], NOW + DAY);
  assert.equal(t.bucket.objects.has(t.path('miso')), false);
  assert.equal((await t.doc('miso')).get('picture'), null);
});

test('a photo gone from the source (still named by the cat) deletes the copy', async () => {
  const t = await setup();
  t.bucket.put(PHOTO, await makeJpeg(10));
  await t.write([cat('miso', PHOTO)]);
  t.bucket.objects.delete(PHOTO);
  await t.write([cat('miso', PHOTO)], NOW + DAY);
  assert.equal(t.bucket.objects.has(t.path('miso')), false);
});

test('an ended connection, a category switched off, a record that left and an expired copy all delete it', async () => {
  const ended = await setup();
  ended.bucket.put(PHOTO, await makeJpeg(10));
  await ended.write([cat('miso', PHOTO)]);
  await ended.session.keepGrant(GRANT_ID, NOW, NOW + 90 * DAY);
  assert.equal(ended.bucket.objects.size, 1, 'only the source photo is left');
  assert.equal(ended.bucket.objects.has(ended.path('miso')), false);
  assert.equal((await ended.doc('miso')).get('picture'), null);

  const off = await setup();
  off.bucket.put(PHOTO, await makeJpeg(10));
  await off.write([cat('miso', PHOTO)]);
  await off.session.deleteCategory(GRANT_ID, 'cats');
  assert.equal(off.bucket.objects.has(off.path('miso')), false);

  const left = await setup();
  left.bucket.put(PHOTO, await makeJpeg(10));
  await left.write([cat('miso', PHOTO), cat('other', null)]);
  await left.session.deleteRefs(GRANT_ID, 'cats', ['miso']);
  assert.equal(left.bucket.objects.has(left.path('miso')), false);

  const gone = await setup();
  gone.bucket.put(PHOTO, await makeJpeg(10));
  await gone.write([cat('miso', PHOTO), cat('other', null)]);
  // A later run is a new session: it sees only what it reads.
  const later = openHelmSession(
    firestore,
    gone.uid,
    () => gone.bucket as unknown as PictureBucket,
  );
  await later.writePage({
    grantId: GRANT_ID,
    connectorId: CONNECTOR,
    accountId: 'site',
    category: 'cats',
    records: [cat('other', null)],
    isFull: true,
    windowStart: 0,
    now: NOW + DAY,
    deepLink: () => null,
  });
  await later.finishCategory({
    grantId: GRANT_ID,
    category: 'cats',
    isFull: true,
    windowStart: 0,
    now: NOW + DAY,
  });
  assert.equal(gone.bucket.objects.has(gone.path('miso')), false);

  const grant = await setup();
  grant.bucket.put(PHOTO, await makeJpeg(10));
  await grant.write([cat('miso', PHOTO)]);
  await grant.session.deleteGrant(GRANT_ID);
  assert.equal(grant.bucket.objects.has(grant.path('miso')), false);

  const expired = await setup();
  expired.bucket.put(PHOTO, await makeJpeg(10));
  await expired.write([cat('miso', PHOTO)]);
  await firestore
    .doc(
      `apps/helm/users/${expired.uid}/synced/${toSyncedId(GRANT_ID, 'cats', 'miso')}`,
    )
    .update({ deleteAfter: NOW - 1 });
  await createHelmSink(() => expired.bucket as unknown as PictureBucket).expire(
    firestore,
    NOW,
  );
  assert.equal(expired.bucket.objects.has(expired.path('miso')), false);
});

const run = async () => {
  const failures: string[] = [];
  for (const [name, body] of tests) {
    try {
      await body();
      console.log(`ok   ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}`, error);
    }
  }
  if (failures.length > 0) {
    console.error(`${failures.length} failed`);
    process.exit(1);
  }
  console.log(`${tests.length} cases passed`);
};

void run();
