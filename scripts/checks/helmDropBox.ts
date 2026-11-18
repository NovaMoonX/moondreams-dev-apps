import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { openWithKey, sealWithKey } from '../../functions/src/appKeys/seal.ts';
import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import {
  DROP_BOX_MAX_ENVELOPE_CHARS,
  DROP_BOX_MAX_ITEMS,
  buildDropBoxCapture,
  createDropBoxPair,
  openEnvelope,
  planImport,
  readEnvelope as readServerEnvelope,
  readPayload,
  unwrapDropBoxKey,
  wrapDropBoxKey,
} from '../../functions/src/apps/helm/dropBox.ts';
import {
  DropBoxTooLarge,
  readDropBoxKey,
  sealToDropBox,
  type DropBoxPayload,
} from '../../src/apps/helm/utils/dropBox.ts';
import { EMPTY_READING } from '../../src/apps/helm/utils/captureReading.ts';

const UID = 'uid-alex';
const NOW = Date.UTC(2026, 10, 9, 20, 0);

const payload = (overrides: Partial<DropBoxPayload> = {}): DropBoxPayload => ({
  captureId: 'capture-0001',
  text: 'Call the dentist tomorrow',
  reading: EMPTY_READING,
  inputMode: 'typed',
  createdAt: NOW - 60_000,
  ...overrides,
});

const rejects = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch {
    return true;
  }
  return false;
};

const pair = await createDropBoxPair();
const deviceKey = readDropBoxKey(pair.publicJwk);
assert.ok(deviceKey, 'the device reads the public key the server hands out');
assert.equal(readDropBoxKey({ kty: 'RSA' }), null);
assert.equal(readDropBoxKey(null), null);

const sealed = await sealToDropBox(UID, deviceKey, payload());
const envelope = readServerEnvelope(sealed);
assert.ok(envelope, 'the server accepts what the device sealed');
assert.deepEqual(Object.keys(sealed).sort(), [
  'ciphertext',
  'createdAt',
  'epk',
  'id',
  'nonce',
]);
assert.ok(!JSON.stringify(sealed).includes('dentist'), 'no plain words in it');

const opened = await openEnvelope(pair.privateKey, UID, envelope);
assert.deepEqual(opened, payload(), 'the server opens what the device sealed');
assert.deepEqual(readPayload(opened, envelope, NOW), payload());

const again = await sealToDropBox(UID, deviceKey, payload());
assert.notEqual(again.ciphertext, sealed.ciphertext, 'each seal is fresh');
assert.notEqual(again.epk, sealed.epk);

assert.ok(
  await rejects(() => openEnvelope(pair.privateKey, 'uid-jamie', envelope)),
  'another person cannot open it',
);
const other = await createDropBoxPair();
assert.ok(
  await rejects(() => openEnvelope(other.privateKey, UID, envelope)),
  'another key cannot open it',
);
const flipped = Buffer.from(sealed.ciphertext, 'base64');
flipped[0] ^= 1;
assert.ok(
  await rejects(() =>
    openEnvelope(pair.privateKey, UID, {
      ...envelope,
      ciphertext: flipped.toString('base64'),
    }),
  ),
  'a changed ciphertext fails',
);
assert.ok(
  await rejects(() =>
    openEnvelope(pair.privateKey, UID, { ...envelope, id: 'capture-0002' }),
  ),
  'an envelope moved to another id fails',
);

assert.equal(
  readPayload(opened, { ...envelope, id: 'capture-0002' }, NOW),
  null,
);
assert.equal(readPayload({ ...payload(), text: '   ' }, envelope, NOW), null);
assert.equal(
  readPayload({ ...payload(), text: 'x'.repeat(4001) }, envelope, NOW),
  null,
);
assert.equal(
  readPayload({ ...payload(), inputMode: 'attachment' }, envelope, NOW),
  null,
);
assert.equal(
  readPayload({ ...payload(), createdAt: NOW }, envelope, NOW),
  null,
  'words and envelope must agree on the time',
);
const future = { ...envelope, createdAt: NOW + 3_600_000 };
assert.equal(
  readPayload({ ...payload(), createdAt: future.createdAt }, future, NOW)
    ?.createdAt,
  NOW,
  'a time ahead of now is stored as now',
);
assert.equal(
  readPayload(
    { ...payload(), createdAt: NOW - 5 },
    { ...envelope, createdAt: NOW - 5 },
    NOW,
  )?.createdAt,
  NOW - 5,
);
assert.equal(
  readPayload({ ...payload(), text: '  padded  ' }, envelope, NOW)?.text,
  'padded',
);

assert.equal(DROP_BOX_MAX_ITEMS, 20);
assert.equal(DROP_BOX_MAX_ENVELOPE_CHARS, 12 * 1024);
assert.equal(readServerEnvelope({ ...sealed, id: '../x' }), null);
assert.equal(readServerEnvelope({ ...sealed, nonce: 'AAAA' }), null);
assert.equal(
  readServerEnvelope({ ...sealed, extra: 'x'.repeat(13_000) }),
  null,
);
assert.equal(readServerEnvelope({ ...sealed, createdAt: 'now' }), null);
assert.equal(readServerEnvelope(null), null);

const longest = await sealToDropBox(
  UID,
  deviceKey,
  payload({ text: 'a'.repeat(4000) }),
);
assert.ok(JSON.stringify(longest).length <= DROP_BOX_MAX_ENVELOPE_CHARS);
assert.ok(
  await rejects(() =>
    sealToDropBox(UID, deviceKey, payload({ text: '😀'.repeat(4000) })),
  ),
  'words too large to keep are refused on the device',
);
await sealToDropBox(UID, deviceKey, payload({ text: '😀'.repeat(4000) })).catch(
  (error: unknown) => assert.ok(error instanceof DropBoxTooLarge),
);

const wrapped = wrapDropBoxKey(DEV_KEYRING, UID, pair, 1_000);
assert.equal(wrapped.masterKeyId, DEV_KEYRING.current);
assert.ok(
  unwrapDropBoxKey(DEV_KEYRING, UID, wrapped).equals(pair.privateKey),
  'the private key comes back from under the keyring',
);
assert.throws(() => unwrapDropBoxKey(DEV_KEYRING, 'uid-jamie', wrapped));
assert.ok(
  !JSON.stringify(wrapped).includes(pair.privateKey.toString('base64')),
);

const second = payload({ captureId: 'capture-0002' });
const plan = planImport(
  [
    { id: 'capture-0001', payload: payload() },
    { id: 'capture-0002', payload: second },
    { id: 'capture-0002', payload: second },
    { id: 'item-3', payload: null },
  ],
  new Set(['capture-0001']),
);
assert.deepEqual(plan.toCreate, [second], 'only the one not held is created');
assert.deepEqual(plan.held, ['capture-0001', 'capture-0002']);
assert.deepEqual(plan.rejected, ['item-3']);
const both = planImport(
  [
    { id: 'capture-0002', payload: null },
    { id: 'capture-0002', payload: second },
  ],
  new Set(),
);
assert.deepEqual(both.held, ['capture-0002'], 'held wins over rejected');
assert.deepEqual(both.rejected, []);
const retry = planImport(
  [{ id: 'capture-0002', payload: second }],
  new Set(['capture-0001', 'capture-0002']),
);
assert.deepEqual(retry.toCreate, [], 'a retried import creates nothing');
assert.deepEqual(retry.held, ['capture-0002']);

const dataKey = { keyId: 'k1', keyVersion: 1, key: randomBytes(32) };
const sealedWords = sealWithKey(
  dataKey,
  {
    text: second.text,
    reading: second.reading,
    answer: null,
    questionAnswer: null,
  },
  1,
);
const capture = buildDropBoxCapture(second, sealedWords);
assert.equal(capture.arrivedVia, 'dropBox');
assert.equal(capture.status, 'received');
assert.equal(capture.seenAt, null);
assert.equal(capture.createdAt, second.createdAt);
assert.equal(capture.sessionId, second.captureId);
assert.equal(openWithKey(dataKey.key, capture.sealed).text, second.text);
assert.ok(!JSON.stringify(capture).includes(second.text));

console.log(
  'check:helm-drop-box: the device seals, the server opens, and nothing weaker gets through.',
);
