import { readFileSync } from 'node:fs';

import {
  DEV_KEYRING,
  deriveSeedDataKey,
  keyCheckPath,
  makeKeyCheck,
  readKeyring,
  wrapDataKey,
} from '../../functions/src/apps/runway/planKey.ts';
import { DEFAULT_CURRENCY_CODE } from '../../src/apps/runway/constants.ts';
import { DAY_MS, startOfUtcDay } from '../../src/apps/runway/engine/dates.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import type {
  ChangeSealed,
  PayLineSealed,
  SourceSealed,
} from '../../src/apps/runway/types.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

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

  const encryption = {
    appId: 'runway' as const,
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const sealed = await sealJson(
    { currencyCode: DEFAULT_CURRENCY_CODE },
    encryption,
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
  const incomeDocuments = await writeSeedIncome(context, owner.uid, encryption);
  const masterKeyIds = Object.keys(keyring.keys);
  masterKeyIds.forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  await batch.commit();

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 2 + incomeDocuments + masterKeyIds.length,
  };
}

/** One source with two pay lines, sealed the way the app seals them: a paycheck every other week that ends after six, and a bonus that arrives once. */
async function writeSeedIncome(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 13 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const bonusDay = today + 20 * DAY_MS;

  const source: SourceSealed = { name: 'Northwind Studio' };
  const paycheck: PayLineSealed = {
    name: 'Paycheck',
    schedule: { kind: 'everyOtherWeek', anchor: firstPayday, monthDays: [] },
    amount: { lowCents: 214_000, highCents: 214_000 },
    ending: { onDate: null, afterCount: 6 },
  };
  const bonus: PayLineSealed = {
    name: 'Spring bonus',
    schedule: { kind: 'once', anchor: bonusDay, monthDays: [] },
    amount: { lowCents: 90_000, highCents: 90_000 },
    ending: { onDate: null, afterCount: null },
  };
  const summaries: ChangeSealed[] = [
    { summary: 'Added Paycheck from Northwind Studio, $2,140.00.' },
    { summary: 'Added Spring bonus from Northwind Studio, $900.00.' },
  ];

  const [sourceSealed, paycheckSealed, bonusSealed, firstChange, secondChange] =
    await Promise.all([
      sealJson(source, encryption),
      sealJson(paycheck, encryption),
      sealJson(bonus, encryption),
      sealJson(summaries[0], encryption),
      sealJson(summaries[1], encryption),
    ]);

  const ids = {
    source: 'seed-income-source',
    paycheck: 'seed-income-paycheck',
    bonus: 'seed-income-bonus',
    firstChange: 'seed-change-paycheck',
    secondChange: 'seed-change-bonus',
  };
  const header = (
    id: string,
    kind: string,
    parentId: string | null,
    createdAt: number,
  ) => ({
    id,
    kind,
    parentId,
    createdAt,
    endedAt: null,
    archivedAt: null,
  });
  const version = (
    id: string,
    itemId: string,
    kind: string,
    createdAt: number,
    effectiveFrom: number,
    changeId: string,
    sealed: unknown,
  ) => ({
    id,
    itemId,
    kind,
    createdAt,
    effectiveFrom,
    effectiveUntil: null,
    changeId,
    sealed,
  });
  const change = (
    id: string,
    createdAt: number,
    effectiveFrom: number,
    itemIds: string[],
    sealed: unknown,
  ) => ({
    id,
    kind: 'planChange',
    createdAt,
    effectiveFrom,
    itemIds,
    sealed,
  });

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.source}`),
    header(ids.source, 'source', null, addedAt),
  );
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.paycheck}`),
    header(ids.paycheck, 'payLine', ids.source, addedAt),
  );
  batch.set(
    context.firestore.doc(`${plan}/items/${ids.bonus}`),
    header(ids.bonus, 'payLine', ids.source, addedAt + DAY_MS),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-source`),
    version(
      'seed-version-source',
      ids.source,
      'source',
      addedAt,
      firstPayday,
      ids.firstChange,
      sourceSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-paycheck`),
    version(
      'seed-version-paycheck',
      ids.paycheck,
      'payLine',
      addedAt,
      firstPayday,
      ids.firstChange,
      paycheckSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-bonus`),
    version(
      'seed-version-bonus',
      ids.bonus,
      'payLine',
      addedAt + DAY_MS,
      bonusDay,
      ids.secondChange,
      bonusSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.firstChange}`),
    change(
      ids.firstChange,
      addedAt,
      firstPayday,
      [ids.source, ids.paycheck],
      firstChange,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.secondChange}`),
    change(
      ids.secondChange,
      addedAt + DAY_MS,
      bonusDay,
      [ids.bonus],
      secondChange,
    ),
  );
  await batch.commit();
  return 8;
}
