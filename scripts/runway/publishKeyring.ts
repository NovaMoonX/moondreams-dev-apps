/**
 * Maintainer-only: adds a master key to the Runway keyring and publishes it as a new secret version.
 *
 *   tsx scripts/runway/publishKeyring.ts --project moondreams-dev-apps --new-id m2 [--keep-current] [--dry-run]
 *
 * A supplied key (a restore) comes from RUNWAY_NEW_KEY (64 hex), never from an argument. Nothing prints key bytes.
 * `--emulator --secret-file <path>` runs the whole flow against the Firestore emulator and a local keyring file.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  KEY_BYTES,
  keyCheckPath,
  makeKeyCheck,
  readKeyring,
  type Keyring,
} from '../../functions/src/apps/runway/planKey.ts';

export const SECRET_NAME = 'RUNWAY_MASTER_KEYS';
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export class Refusal extends Error {}

export interface SecretStore {
  readLatest(): Promise<string | null>;
  addVersion(keyringJson: string): Promise<void>;
}

/** Throws a `Refusal` unless `next` only adds ids to `previous`, names a `current` it holds and holds only 32-byte keys. */
export function assertPublishable(previous: Keyring, next: Keyring) {
  const dropped = Object.keys(previous.keys).filter(
    (id) => !Object.hasOwn(next.keys, id),
  );
  if (dropped.length > 0) {
    throw new Refusal(
      `Refused: the new keyring drops ${dropped.join(', ')}. Ids are only ever added.`,
    );
  }
  const changed = Object.keys(previous.keys).filter(
    (id) => next.keys[id] !== previous.keys[id],
  );
  if (changed.length > 0) {
    throw new Refusal(
      `Refused: the new keyring changes the key behind ${changed.join(', ')}. Ids are never reused.`,
    );
  }
  if (!Object.hasOwn(next.keys, next.current)) {
    throw new Refusal(
      `Refused: current is ${next.current}, which is not in keys.`,
    );
  }
  const wrongSize = Object.entries(next.keys)
    .filter(([, hex]) => !/^[0-9a-f]{64}$/i.test(String(hex)))
    .map(([id]) => id);
  if (wrongSize.length > 0) {
    throw new Refusal(
      `Refused: the key for ${wrongSize.join(', ')} is not ${KEY_BYTES} bytes of hex.`,
    );
  }
}

/** The keyring after adding one key; refuses a malformed id, a reused id or a key that is not 32 bytes. */
export function addKeyToKeyring(
  previous: Keyring,
  newId: string,
  newKeyHex: string,
  makeCurrent: boolean,
) {
  if (!ID_PATTERN.test(newId)) {
    throw new Refusal(
      'Refused: an id is 1 to 32 characters of a-z, 0-9 and "-".',
    );
  }
  if (Object.hasOwn(previous.keys, newId)) {
    throw new Refusal(`Refused: ${newId} is already in the keyring.`);
  }
  const next: Keyring = {
    current: makeCurrent ? newId : previous.current,
    keys: { ...previous.keys, [newId]: newKeyHex.toLowerCase() },
  };
  assertPublishable(previous, next);
  return next;
}

export interface PublishOptions {
  newId: string;
  newKeyHex: string | null;
  makeCurrent: boolean;
  dryRun: boolean;
}

/** Order: validate, write the new canary, add the version. A failed add removes the canary again. */
export async function publishKeyring(
  store: SecretStore,
  firestore: Firestore | null,
  options: PublishOptions,
  now = Date.now(),
) {
  const raw = await store.readLatest();
  if (!raw) {
    throw new Refusal(
      `Refused: ${SECRET_NAME} has no version to build on. Create the first one with the runbook command.`,
    );
  }
  const previous = (() => {
    try {
      return readKeyring(raw);
    } catch {
      throw new Refusal(
        'Refused: the latest version is not a valid keyring, so nothing can be added to it.',
      );
    }
  })();
  const keyHex = options.newKeyHex ?? randomBytes(KEY_BYTES).toString('hex');
  const next = addKeyToKeyring(
    previous,
    options.newId,
    keyHex,
    options.makeCurrent,
  );

  const summary = {
    added: options.newId,
    previousCurrent: previous.current,
    current: next.current,
    ids: Object.keys(next.keys),
    keySource: options.newKeyHex ? 'supplied' : 'generated',
    published: false,
  };
  if (options.dryRun || !firestore) return summary;

  const checkRef = firestore.doc(keyCheckPath(options.newId));
  await checkRef.create(makeKeyCheck(next, options.newId, now));
  try {
    await store.addVersion(JSON.stringify(next));
  } catch (error) {
    await checkRef.delete();
    throw error;
  }
  return { ...summary, published: true };
}

export function gcloudStore(project: string): SecretStore {
  const base = ['secrets', 'versions'];
  const common = [`--secret=${SECRET_NAME}`, `--project=${project}`];
  return {
    async readLatest() {
      try {
        return execFileSync(
          'gcloud',
          [...base, 'access', 'latest', ...common],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        );
      } catch {
        return null;
      }
    },
    async addVersion(keyringJson) {
      execFileSync(
        'gcloud',
        [...base, 'add', SECRET_NAME, '--data-file=-', `--project=${project}`],
        {
          input: keyringJson,
          stdio: ['pipe', 'ignore', 'inherit'],
        },
      );
    },
  };
}

export function fileStore(path: string): SecretStore {
  return {
    async readLatest() {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    async addVersion(keyringJson) {
      writeFileSync(path, keyringJson);
    },
  };
}

const flag = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : (process.argv[index + 1] ?? '');
};
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const project = flag('project') ?? 'moondreams-dev-apps';
  const newId = flag('new-id');
  if (!newId) throw new Refusal('Refused: --new-id is required.');
  const isEmulator = has('emulator');
  const secretFile = flag('secret-file');
  if (isEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    if (!secretFile)
      throw new Refusal('Refused: --emulator needs --secret-file.');
  }
  const dryRun = has('dry-run');
  if (getApps().length === 0) initializeApp({ projectId: project });

  const summary = await publishKeyring(
    isEmulator && secretFile ? fileStore(secretFile) : gcloudStore(project),
    dryRun ? null : getFirestore(),
    {
      newId,
      newKeyHex: process.env.RUNWAY_NEW_KEY ?? null,
      makeCurrent: !has('keep-current'),
      dryRun,
    },
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    summary.published
      ? `Published. Save the new keyring to escrow now (read it with: gcloud secrets versions access latest --secret=${SECRET_NAME} --project=${project}).`
      : 'Dry run: nothing was written.',
  );
}

if (process.argv[1]?.endsWith('publishKeyring.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Refusal ? error.message : 'Publish failed.');
    process.exitCode = 1;
  });
}
