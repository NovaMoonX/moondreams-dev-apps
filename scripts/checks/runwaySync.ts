import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { getDirtyFrom as appDirtyFrom } from '../../src/apps/runway/engine/closings.ts';
import {
  normalizeTransaction,
  toTransactionCents,
} from '../../functions/src/apps/runway/link/normalize.ts';
import type {
  NormalizedTransaction,
  TransactionSync,
} from '../../functions/src/apps/runway/link/provider.ts';
import { standInProvider } from '../../functions/src/apps/runway/link/providerStandIn.ts';
import {
  applyTransactions,
  dedupeSubkey,
  getDirtyFrom,
  makeDedupeKey,
  purchaseIdFor,
  repriceLines,
  targetsByProviderAccount,
  waitingLines,
  type PurchaseState,
} from '../../functions/src/apps/runway/link/syncPlan.ts';
import { verifyPlaidWebhook } from '../../functions/src/apps/runway/link/webhookVerify.ts';

const DAY = 86_400_000;

// Plaid already reports money out as positive, so the cents keep the sign.
assert.equal(toTransactionCents(12.34), 1234, 'a charge is positive cents');
assert.equal(toTransactionCents(-2150), -215_000, 'a deposit is negative');
assert.equal(
  toTransactionCents(0.1 + 0.2),
  30,
  'floating dollars round to cents',
);
assert.equal(
  normalizeTransaction({
    id: 'a',
    pendingId: '',
    accountId: 'x',
    date: '2026-02-30x',
    amount: 1,
    merchantName: null,
    name: null,
    isPending: false,
  }),
  null,
  'a date that is not a day is refused',
);
assert.equal(
  normalizeTransaction({
    id: 'a',
    pendingId: null,
    accountId: 'x',
    date: '2026-10-05',
    amount: 5,
    merchantName: null,
    name: ' Shell ',
    isPending: false,
  })?.merchant,
  'Shell',
  'the merchant falls back to the name',
);
assert.equal(
  normalizeTransaction({
    id: 'z',
    pendingId: null,
    accountId: 'x',
    date: '2026-10-05',
    amount: 0.001,
    merchantName: 'Shell',
    name: null,
    isPending: false,
  }),
  null,
  'a zero-amount charge is never a purchase',
);

const planKey = Buffer.alloc(32, 7);
const subkey = dedupeSubkey(planKey);
const keyOf = (id: string) => makeDedupeKey(subkey, 'link-1', id);
assert.equal(keyOf('t1'), keyOf('t1'), 'the same transaction has the same key');
assert.notEqual(keyOf('t1'), keyOf('t2'));
assert.notEqual(
  keyOf('t1'),
  makeDedupeKey(subkey, 'link-2', 't1'),
  'another link makes another key',
);
assert.notEqual(
  keyOf('t1'),
  makeDedupeKey(dedupeSubkey(Buffer.alloc(32, 8)), 'link-1', 't1'),
  'another plan makes another key',
);
assert.match(keyOf('t1'), /^[0-9a-f]{64}$/);
assert.equal(purchaseIdFor(keyOf('t1')).length, 32);

const targets = targetsByProviderAccount([
  {
    providerAccountId: 'card',
    accountId: null,
    cardId: 'c1',
    isSkipped: false,
  },
  { providerAccountId: 'chk', accountId: 'a1', cardId: null, isSkipped: false },
  { providerAccountId: 'sav', accountId: null, cardId: null, isSkipped: true },
  { providerAccountId: 'new', accountId: null, cardId: null, isSkipped: false },
]);
assert.deepEqual(
  [...targets.keys()],
  ['card', 'chk'],
  'skipped and unmatched are dropped',
);

const tx = (
  id: string,
  account: string,
  cents: number,
  extra: Partial<NormalizedTransaction> = {},
): NormalizedTransaction => ({
  providerTransactionId: id,
  pendingTransactionId: null,
  providerAccountId: account,
  date: Date.UTC(2026, 10, 1),
  amountCents: cents,
  merchant: 'Cafe',
  isPending: false,
  ...extra,
});

assert.deepEqual(waitingLines(500), [
  { envelopeId: null, cents: 500, via: 'free' },
]);
assert.deepEqual(waitingLines(-500), [], 'money in counts for nothing');
assert.deepEqual(
  repriceLines(
    [
      { envelopeId: 'a', cents: 600, via: 'chosen' },
      { envelopeId: 'b', cents: 400, via: 'chosen' },
    ],
    1000,
    1250,
  ).map((line) => line.cents),
  [600, 650],
  'a tip goes to the last line',
);

const store = (outcome: ReturnType<typeof applyTransactions>) =>
  new Map(
    [...outcome.writes].flatMap(([id, state]) =>
      state
        ? [[id, { ...state, isNew: false, isChanged: false }] as const]
        : [],
    ),
  );

const first = applyTransactions(
  keyOf,
  targets,
  [
    tx('t1', 'card', 500),
    tx('t2', 'chk', -9000),
    tx('t3', 'sav', 100),
    tx('t4-pending', 'card', 675, { isPending: true }),
  ],
  [],
  [],
  new Map(),
);
assert.equal(first.created, 3, 'three created, the skipped account dropped');
assert.equal(first.dropped, 1);
const stored = store(first);
const replay = applyTransactions(
  keyOf,
  targets,
  [
    tx('t1', 'card', 500),
    tx('t2', 'chk', -9000),
    tx('t4-pending', 'card', 675, { isPending: true }),
  ],
  [],
  [],
  stored,
);
assert.equal(
  replay.writes.size,
  0,
  'a replay writes nothing, so no second document',
);

const pendingId = purchaseIdFor(keyOf('t4-pending'));
const person = new Map<string, PurchaseState>(stored);
const waiting = person.get(pendingId) as PurchaseState;
person.set(pendingId, {
  ...waiting,
  needsHome: false,
  payload: {
    ...waiting.payload,
    merchant: 'My coffee',
    lines: [{ envelopeId: 'env-1', cents: 675, via: 'chosen' }],
  },
});
const posted = applyTransactions(
  keyOf,
  targets,
  [
    tx('t4', 'card', 750, {
      pendingTransactionId: 't4-pending',
      date: Date.UTC(2026, 10, 2),
    }),
  ],
  [],
  ['t4-pending'],
  person,
);
const kept = posted.writes.get(pendingId);
assert.ok(kept, 'the posted charge updates the pending document');
assert.equal(
  posted.writes.size,
  1,
  'no second document, and the pending removal did not delete it',
);
assert.equal(kept.status, 'posted');
assert.equal(kept.needsHome, false, 'an assignment is kept');
assert.equal(kept.payload.merchant, 'My coffee', 'a renamed merchant is kept');
assert.equal(kept.payload.amountCents, 750);
assert.deepEqual(kept.payload.lines, [
  { envelopeId: 'env-1', cents: 750, via: 'chosen' },
]);
assert.equal(kept.date, Date.UTC(2026, 10, 2));
assert.equal(
  kept.dedupeKey,
  keyOf('t4-pending'),
  'it keeps the pending dedupe key',
);

const unassigned = applyTransactions(
  keyOf,
  targets,
  [tx('t4', 'card', 750, { pendingTransactionId: 't4-pending' })],
  [],
  [],
  stored,
);
assert.deepEqual(
  unassigned.writes.get(pendingId)?.payload.lines,
  [{ envelopeId: null, cents: 750, via: 'free' }],
  'a waiting purchase is repriced to the posted amount',
);

const gone = applyTransactions(
  keyOf,
  targets,
  [],
  [],
  ['t4-pending', 't1'],
  person,
);
assert.equal(
  gone.writes.get(pendingId),
  undefined,
  'an assigned purchase is never removed',
);
assert.equal(gone.removed, 0);
const cancelled = applyTransactions(
  keyOf,
  targets,
  [],
  [],
  ['t4-pending'],
  stored,
);
assert.equal(
  cancelled.writes.get(pendingId),
  null,
  'a waiting pending charge that never posted is removed',
);

const withoutTwin = applyTransactions(
  keyOf,
  targets,
  [tx('t5', 'card', 100, { pendingTransactionId: 'unseen-pending' })],
  [],
  [],
  new Map(),
);
assert.equal(
  withoutTwin.created,
  1,
  'a posted charge whose pending twin was never seen is just new',
);

// The stand-in bank, synced twice, ends with one coffee, posted.
const standInTargets = targetsByProviderAccount([
  {
    providerAccountId: 'stand-in-sapphire',
    accountId: null,
    cardId: 'c1',
    isSkipped: false,
  },
  {
    providerAccountId: 'stand-in-checking',
    accountId: 'a1',
    cardId: null,
    isSkipped: false,
  },
]);
const grant = { credential: 'stand-in', providerItemId: 'stand-in-x' };
const run = async (cursor: string | null, held: Map<string, PurchaseState>) => {
  const page: TransactionSync = await standInProvider.syncTransactions(
    grant,
    cursor,
  );
  const outcome = applyTransactions(
    keyOf,
    standInTargets,
    page.added,
    page.modified,
    page.removed,
    held,
  );
  return { page, outcome };
};
const one = await run(null, new Map());
assert.equal(one.outcome.created, 6, 'the stand-in bank sends six');
const two = await run(one.page.nextCursor, store(one.outcome));
const afterTwo = new Map([...store(one.outcome), ...store(two.outcome)]);
const coffee = [...afterTwo.values()].filter(
  (state) => state.payload.merchant === 'Blue Bottle Coffee',
);
assert.equal(coffee.length, 1, 'the pending coffee became the posted one');
assert.equal(coffee[0].status, 'posted');
assert.equal(
  [...afterTwo.values()].filter((state) => state.payload.amountCents < 0)
    .length,
  1,
  'one deposit',
);
const three = await run(two.page.nextCursor, afterTwo);
assert.equal(three.outcome.writes.size, 0, 'a third sync changes nothing');

// Closed months are marked the way the app marks them.
const today = Date.UTC(2026, 10, 5);
[
  [null, [today - 3 * DAY]],
  [null, [today - 30 * DAY]],
  [null, [today - 50 * DAY, today - 3 * DAY]],
  ['2026-09', [today - 3 * DAY]],
  ['2026-09', [today - 70 * DAY]],
].forEach(([current, dates]) => {
  const mine = getDirtyFrom(current as string | null, dates as number[], today);
  const theirs = appDirtyFrom(
    current as string | null,
    dates as number[],
    today,
  );
  assert.equal(
    mine,
    theirs.isTouched ? theirs.dirtyFrom : null,
    `dirtyFrom agrees for ${String(current)} ${JSON.stringify(dates)}`,
  );
});

// A webhook is accepted only with a valid signature over its own body, and only while fresh.
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const jwk = publicKey.export({ format: 'jwk' });
const key = {
  kty: 'EC',
  crv: 'P-256',
  x: jwk.x as string,
  y: jwk.y as string,
  kid: 'k1',
  expired_at: null,
};
const body = Buffer.from(
  JSON.stringify({
    webhook_type: 'TRANSACTIONS',
    webhook_code: 'SYNC_UPDATES_AVAILABLE',
    item_id: 'i1',
  }),
);
const b64 = (value: object | Buffer) =>
  (Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(value))
  ).toString('base64url');
const makeHeader = (claims: object, alg = 'ES256') => {
  const head = b64({ alg, kid: 'k1', typ: 'JWT' });
  const payload = b64(claims);
  const signature = sign('sha256', Buffer.from(`${head}.${payload}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${head}.${payload}.${b64(signature)}`;
};
const now = Date.now();
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const getKey = async (id: string) => (id === 'k1' ? key : null);
const good = makeHeader({
  iat: Math.floor(now / 1000),
  request_body_sha256: hash(body),
});
assert.equal(
  await verifyPlaidWebhook(good, body, now, getKey),
  true,
  'a signed webhook passes',
);
assert.equal(
  await verifyPlaidWebhook(
    good,
    Buffer.from('{"item_id":"other"}'),
    now,
    getKey,
  ),
  false,
  'a changed body fails',
);
assert.equal(
  await verifyPlaidWebhook(undefined, body, now, getKey),
  false,
  'no header fails',
);
assert.equal(
  await verifyPlaidWebhook('a.b.c', body, now, getKey),
  false,
  'garbage fails without throwing',
);
assert.equal(
  await verifyPlaidWebhook(
    makeHeader({
      iat: Math.floor(now / 1000) - 600,
      request_body_sha256: hash(body),
    }),
    body,
    now,
    getKey,
  ),
  false,
  'a header older than five minutes fails',
);
assert.equal(
  await verifyPlaidWebhook(
    makeHeader(
      { iat: Math.floor(now / 1000), request_body_sha256: hash(body) },
      'HS256',
    ),
    body,
    now,
    getKey,
  ),
  false,
  'another algorithm fails',
);
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const forgedHead = b64({ alg: 'ES256', kid: 'k1' });
const forgedPayload = b64({
  iat: Math.floor(now / 1000),
  request_body_sha256: hash(body),
});
const forgedSig = sign(
  'sha256',
  Buffer.from(`${forgedHead}.${forgedPayload}`),
  { key: other.privateKey, dsaEncoding: 'ieee-p1363' },
);
assert.equal(
  await verifyPlaidWebhook(
    `${forgedHead}.${forgedPayload}.${b64(forgedSig)}`,
    body,
    now,
    getKey,
  ),
  false,
  'a signature from another key fails',
);
assert.equal(
  await verifyPlaidWebhook(good, body, now, async () => null),
  false,
  'an unknown key id fails',
);

console.log('runwaySync: all checks passed');
