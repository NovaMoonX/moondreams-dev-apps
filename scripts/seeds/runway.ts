import { readFileSync } from 'node:fs';

import {
  DEV_KEYRING,
  deriveSeedDataKey,
  readKeyring,
  wrapDataKey,
} from '../../functions/src/apps/runway/planKey.ts';
import { DEFAULT_CURRENCY_CODE } from '../../src/apps/runway/constants.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;
const SECRET_FILE = new URL('../../functions/.secret.local', import.meta.url);

/** The emulator's keyring: `RUNWAY_MASTER_KEYS` in functions/.secret.local, else the built-in development one. */
function readEmulatorKeyring() {
  try {
    const line = readFileSync(SECRET_FILE, 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith('RUNWAY_MASTER_KEYS='));
    const raw = line
      ?.slice('RUNWAY_MASTER_KEYS='.length)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    return raw ? readKeyring(raw) : DEV_KEYRING;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return DEV_KEYRING;
    throw error;
  }
}

/** Alex has a plan that opens like a real one; every other account has none, so its first open creates one. */
export async function seedRunway(context: SeedContext): Promise<SeedResult> {
  const keyring = readEmulatorKeyring();
  const owner = FIXTURE_USERS.partnerOne;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const createdAt = context.now - 14 * DAY_MS;

  const sealed = await sealJson(
    { currencyCode: DEFAULT_CURRENCY_CODE },
    {
      appId: 'runway',
      keyId: data.keyId,
      keyVersion: 1,
      key: data.key.toString('hex'),
    },
  );

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`apps/runway/server/${owner.uid}/keys/data`),
    wrapDataKey(keyring, owner.uid, data, createdAt),
  );
  batch.set(context.firestore.doc(`apps/runway/plans/${owner.uid}`), {
    uid: owner.uid,
    createdAt,
    updatedAt: createdAt,
    stance: 'conservative',
    keyId: data.keyId,
    sealed,
  });
  await batch.commit();

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: 2 };
}
