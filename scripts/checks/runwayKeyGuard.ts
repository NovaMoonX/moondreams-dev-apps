// Run against the Firestore emulator: `npm run check:runway-keys`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  keyCheckPath,
  makeKeyCheck,
  type Keyring,
} from '../../functions/src/apps/runway/planKey.ts';
import { checkRunwayKeys } from '../../functions/src/apps/runway/verifyRunwayKeys.ts';
import { openTestPlan, seedTestPlan } from '../runway/drillKeyring.ts';
import {
  addKeyToKeyring,
  assertPublishable,
  fileStore,
  publishKeyring,
  Refusal,
} from '../runway/publishKeyring.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
if (getApps().length === 0) initializeApp({ projectId: 'moondreams-dev-apps' });
const firestore = getFirestore();

const hex = (digit: string) => digit.repeat(64);
const ring = (current: string, ids: Record<string, string>): Keyring => ({
  current,
  keys: ids,
});
const base = ring('m1', { m1: hex('a') });

const refuses = (run: () => unknown, pattern: RegExp) =>
  assert.throws(
    run,
    (error) => error instanceof Refusal && pattern.test(error.message),
  );

async function clearChecks() {
  const snapshot = await firestore.collection('apps/runway/keyChecks').get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}
async function writeChecks(keyring: Keyring, ids = Object.keys(keyring.keys)) {
  await clearChecks();
  await Promise.all(
    ids.map((id) =>
      firestore.doc(keyCheckPath(id)).set(makeKeyCheck(keyring, id, 1)),
    ),
  );
}

// Tool refusals
const two = ring('m2', { m1: hex('a'), m2: hex('b') });
refuses(() => assertPublishable(two, ring('m2', { m2: hex('b') })), /drops m1/);
refuses(
  () => assertPublishable(base, ring('m9', { m1: hex('a') })),
  /not in keys/,
);
refuses(
  () => assertPublishable(base, ring('m1', { m1: hex('a'), m2: 'abcd' })),
  /not 32 bytes/,
);
refuses(
  () => assertPublishable(base, ring('m1', { m1: hex('c') })),
  /changes the key behind m1/,
);
refuses(
  () => addKeyToKeyring(base, 'm2', hex('b').slice(2), true),
  /not 32 bytes/,
);
refuses(
  () => addKeyToKeyring(base, 'm1', hex('b'), true),
  /already in the keyring/,
);
refuses(() => addKeyToKeyring(base, 'M 2', hex('b'), true), /an id is/);
const added = addKeyToKeyring(base, 'm2', hex('b'), true);
assert.equal(added.current, 'm2');
assert.deepEqual(Object.keys(added.keys), ['m1', 'm2']);
assert.equal(addKeyToKeyring(base, 'm2', hex('b'), false).current, 'm1');

// Tool end to end against a local keyring file and the emulator
const dir = mkdtempSync(join(tmpdir(), 'runway-keys-'));
const file = join(dir, 'keyring.json');
const store = fileStore(file);
const options = {
  newId: 'm2',
  newKeyHex: hex('b'),
  makeCurrent: true,
  dryRun: false,
};

await clearChecks();
await assert.rejects(publishKeyring(store, firestore, options), /no version/);
writeFileSync(file, JSON.stringify(base));
const dry = await publishKeyring(store, firestore, {
  ...options,
  dryRun: true,
});
assert.equal(dry.published, false);
assert.equal(readFileSync(file, 'utf8'), JSON.stringify(base));
assert.equal((await firestore.doc(keyCheckPath('m2')).get()).exists, false);

const summary = await publishKeyring(store, firestore, options);
assert.equal(summary.published, true);
assert.ok(
  !JSON.stringify(summary).includes(hex('b')) &&
    !JSON.stringify(summary).includes(hex('a')),
);
assert.equal(readKeyringFile().current, 'm2');
assert.equal((await firestore.doc(keyCheckPath('m2')).get()).exists, true);
await assert.rejects(
  publishKeyring(store, firestore, options),
  /already in the keyring/,
);

const generated = await publishKeyring(store, firestore, {
  ...options,
  newId: 'm3',
  newKeyHex: null,
});
assert.equal(generated.keySource, 'generated');
assert.equal(Object.keys(readKeyringFile().keys).length, 3);

const failingStore = {
  readLatest: store.readLatest,
  addVersion: async () => {
    throw new Error('boom');
  },
};
await assert.rejects(
  publishKeyring(failingStore, firestore, { ...options, newId: 'm4' }),
  /boom/,
);
assert.equal((await firestore.doc(keyCheckPath('m4')).get()).exists, false);

function readKeyringFile() {
  return JSON.parse(readFileSync(file, 'utf8')) as Keyring;
}

// The check
const healthy = ring('m2', { m1: hex('a'), m2: hex('b') });
await writeChecks(healthy);
const ok = await checkRunwayKeys(firestore, () => healthy);
assert.deepEqual(ok, { checked: 2, failures: [] });

const missingId = await checkRunwayKeys(firestore, () =>
  ring('m2', { m2: hex('b') }),
);
assert.deepEqual(missingId.failures, [
  { masterKeyId: 'm1', reason: 'missing-id' },
]);

await writeChecks(healthy, ['m1']);
const noCanary = await checkRunwayKeys(firestore, () => healthy);
assert.deepEqual(noCanary.failures, [
  { masterKeyId: 'm2', reason: 'missing-canary' },
]);

await writeChecks(healthy);
const wrongKey = await checkRunwayKeys(firestore, () =>
  ring('m2', { m1: hex('a'), m2: hex('c') }),
);
assert.deepEqual(wrongKey.failures, [
  { masterKeyId: 'm2', reason: 'unwrap-failed' },
]);

await firestore.doc(keyCheckPath('m1')).update({ expectedDigest: hex('0') });
const badDigest = await checkRunwayKeys(firestore, () => healthy);
assert.deepEqual(badDigest.failures, [
  { masterKeyId: 'm1', reason: 'unwrap-failed' },
]);

const damaged = await checkRunwayKeys(firestore, () => {
  throw new Error('Every master key must be 32 bytes of hex.');
});
assert.deepEqual(damaged.failures, [
  { masterKeyId: null, reason: 'keyring-invalid' },
]);
const unreadable = await checkRunwayKeys(firestore, () => {
  throw new Error('version is disabled');
});
assert.deepEqual(unreadable.failures, [
  { masterKeyId: null, reason: 'secret-unreadable' },
]);

// Nothing the check returns carries key material
for (const run of [ok, missingId, noCanary, wrongKey, badDigest]) {
  const text = JSON.stringify(run);
  assert.ok(!/[0-9a-f]{32}/.test(text), 'no hex run in a result');
}

// The recovery drill helper: opens with the escrowed keyring, not with another
const drillRing = JSON.stringify(ring('m2', { m1: hex('a'), m2: hex('b') }));
await firestore.doc('apps/runway/server/drill-test-plan/keys/data').delete();
await assert.rejects(
  openTestPlan(firestore, drillRing),
  (error) => error instanceof Refusal && /not been seeded/.test(error.message),
);
assert.deepEqual(await seedTestPlan(firestore, drillRing), {
  masterKeyId: 'm2',
});
await assert.rejects(seedTestPlan(firestore, drillRing));
assert.deepEqual(await openTestPlan(firestore, drillRing), {
  opened: true,
  masterKeyId: 'm2',
});
const withoutM2 = JSON.stringify(ring('m1', { m1: hex('a') }));
assert.deepEqual(await openTestPlan(firestore, withoutM2), {
  opened: false,
  masterKeyId: 'm2',
});
const otherM2 = JSON.stringify(ring('m2', { m2: hex('c') }));
assert.equal((await openTestPlan(firestore, otherM2)).opened, false);
await firestore.doc('apps/runway/server/drill-test-plan/keys/data').delete();

await clearChecks();
console.log('runway key guard: all checks passed');
