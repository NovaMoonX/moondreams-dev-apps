/**
 * Maintainer-only, for the recovery drill in a scratch project. Never touches the real project.
 *
 *   tsx scripts/appKeys/drillKeyring.ts seed --app runway|helm --project <scratch> (--keyring-file <path> | --from-secret)
 *   tsx scripts/appKeys/drillKeyring.ts open --app runway|helm --project <scratch> (--keyring-file <path> | --from-secret)
 *
 * `seed` writes a test plan's wrapped key under the keyring's current master key. `open` unwraps it with the
 * keyring you give (an escrow file, or the secret's latest version) and says only whether it opened.
 * `--emulator` runs against the Firestore emulator. Nothing prints key bytes.
 */
import { readFileSync } from 'node:fs';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { readKeyring } from '../../functions/src/appKeys/keyring.ts';
import {
  createDataKey,
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from '../../functions/src/appKeys/wrap.ts';
import { readAppFlag, type AppKeys } from './apps.ts';
import { gcloudStore, Refusal } from './publishKeyring.ts';

const REAL_PROJECT = 'moondreams-dev-apps';

/** Seeds one wrapped key under the keyring's current id; refuses a document that is already there. */
export async function seedTestPlan(
  firestore: FirebaseFirestore.Firestore,
  keyringJson: string,
  app: AppKeys,
  now = Date.now(),
) {
  const keyring = readKeyring(keyringJson);
  const wrapped = wrapDataKey(
    keyring,
    app.drillUid,
    createDataKey('drill'),
    now,
  );
  await firestore.doc(app.wrappedKeyPath(app.drillUid)).create(wrapped);
  return { masterKeyId: wrapped.masterKeyId };
}

/** True only when the keyring's key for the id the document names opens it to a 32-byte key. */
export async function openTestPlan(
  firestore: FirebaseFirestore.Firestore,
  keyringJson: string,
  app: AppKeys,
) {
  const keyring = readKeyring(keyringJson);
  const snapshot = await firestore.doc(app.wrappedKeyPath(app.drillUid)).get();
  if (!snapshot.exists) {
    throw new Refusal('Refused: the test plan has not been seeded here.');
  }
  const wrapped = snapshot.data() as WrappedKey;
  try {
    unwrapDataKey(keyring, app.drillUid, wrapped);
    return { opened: true, masterKeyId: wrapped.masterKeyId };
  } catch {
    return { opened: false, masterKeyId: wrapped.masterKeyId };
  }
}

const flag = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : (process.argv[index + 1] ?? '');
};
const has = (name: string) => process.argv.includes(`--${name}`);

async function readKeyringText(project: string, app: AppKeys) {
  const file = flag('keyring-file');
  if (file) return readFileSync(file, 'utf8');
  if (has('from-secret')) {
    const text = await gcloudStore(project, app.secretName).readLatest();
    if (text) return text;
    throw new Refusal('Refused: the secret has no readable latest version.');
  }
  throw new Refusal('Refused: pass --keyring-file <path> or --from-secret.');
}

async function main() {
  const command = process.argv[2];
  const app = readAppFlag(flag('app'));
  const project = flag('project');
  if (!project) throw new Refusal('Refused: --project is required.');
  const isEmulator = has('emulator');
  if (isEmulator) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  if (!isEmulator && process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Refusal(
      'Refused: FIRESTORE_EMULATOR_HOST is set. Unset it, or pass --emulator.',
    );
  }
  if (!isEmulator && project === REAL_PROJECT) {
    throw new Refusal(
      'Refused: the drill runs in a scratch project, never in the real one.',
    );
  }
  if (project === REAL_PROJECT && has('from-secret')) {
    throw new Refusal(
      "Refused: the drill never reads the real project's keyring.",
    );
  }
  if (command !== 'seed' && command !== 'open') {
    throw new Refusal('Refused: the command is seed or open.');
  }
  if (getApps().length === 0) initializeApp({ projectId: project });
  const firestore = getFirestore();
  const keyringJson = await readKeyringText(project, app);

  if (command === 'seed') {
    const result = await seedTestPlan(firestore, keyringJson, app);
    console.log(
      `Seeded the test plan's wrapped key under ${result.masterKeyId}.`,
    );
    return;
  }
  const result = await openTestPlan(firestore, keyringJson, app);
  console.log(
    result.opened
      ? `Opened: the test plan's key unwrapped under ${result.masterKeyId}.`
      : `Did not open: the keyring cannot unwrap a key made under ${result.masterKeyId}.`,
  );
  process.exitCode = result.opened ? 0 : 1;
}

if (process.argv[1]?.endsWith('drillKeyring.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Refusal ? error.message : 'Drill failed.');
    process.exitCode = 1;
  });
}
