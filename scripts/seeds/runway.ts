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
import {
  DAY_MS,
  startOfUtcDay,
  toDayKey,
} from '../../src/apps/runway/engine/dates.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import type {
  ChangeSealed,
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
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
  const envelopeDocuments = await writeSeedEnvelopes(
    context,
    owner.uid,
    encryption,
  );
  const billDocuments = await writeSeedBills(context, owner.uid, encryption);
  const goalDocuments = await writeSeedGoals(context, owner.uid, encryption);
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
    firestoreDocuments:
      2 +
      incomeDocuments +
      envelopeDocuments +
      billDocuments +
      goalDocuments +
      masterKeyIds.length,
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
  const freelanceDay = today + 6 * DAY_MS;

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
  const freelance: PayLineSealed = {
    name: 'Freelance payment',
    schedule: { kind: 'once', anchor: freelanceDay, monthDays: [] },
    amount: { lowCents: 12_000, highCents: 12_000 },
    ending: { onDate: null, afterCount: null },
  };
  const summaries: ChangeSealed[] = [
    { summary: 'Added Paycheck from Northwind Studio, $2,140.00.' },
    { summary: 'Added Spring bonus from Northwind Studio, $900.00.' },
    { summary: 'Added Freelance payment from Northwind Studio, $120.00.' },
  ];

  const [
    sourceSealed,
    paycheckSealed,
    bonusSealed,
    freelanceSealed,
    firstChange,
    secondChange,
    thirdChange,
  ] = await Promise.all([
    sealJson(source, encryption),
    sealJson(paycheck, encryption),
    sealJson(bonus, encryption),
    sealJson(freelance, encryption),
    sealJson(summaries[0], encryption),
    sealJson(summaries[1], encryption),
    sealJson(summaries[2], encryption),
  ]);

  const ids = {
    source: 'seed-income-source',
    paycheck: 'seed-income-paycheck',
    bonus: 'seed-income-bonus',
    firstChange: 'seed-change-paycheck',
    secondChange: 'seed-change-bonus',
    freelance: 'seed-income-freelance',
    thirdChange: 'seed-change-freelance',
  };
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
    context.firestore.doc(`${plan}/items/${ids.freelance}`),
    header(ids.freelance, 'payLine', ids.source, addedAt + 2 * DAY_MS),
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
    context.firestore.doc(`${plan}/versions/seed-version-freelance`),
    version(
      'seed-version-freelance',
      ids.freelance,
      'payLine',
      addedAt + 2 * DAY_MS,
      freelanceDay,
      ids.thirdChange,
      freelanceSealed,
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
  batch.set(
    context.firestore.doc(`${plan}/changes/${ids.thirdChange}`),
    change(
      ids.thirdChange,
      addedAt + 2 * DAY_MS,
      freelanceDay,
      [ids.freelance],
      thirdChange,
    ),
  );
  await batch.commit();
  return 11;
}

/** Seven envelopes across Must, Should and Want, all three cadences, a percentage of the day and the rest, sealed the way the app seals them. */
async function writeSeedEnvelopes(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 12 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });

  const envelopes: { id: string; payload: EnvelopeSealed }[] = [
    {
      id: 'seed-envelope-groceries',
      payload: {
        name: 'Groceries',
        emoji: '🛒',
        priority: 'must',
        orderIndex: 1,
        funding: { amount: exact(15_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-envelope-gas',
      payload: {
        name: 'Gas',
        emoji: null,
        priority: 'must',
        orderIndex: 2,
        funding: {
          amount: exact(6_000),
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-envelope-dining',
      payload: {
        name: 'Dining out',
        emoji: '🍜',
        priority: 'should',
        orderIndex: 1,
        funding: { amount: exact(5_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-envelope-gifts',
      payload: {
        name: 'Birthday and holiday gifts',
        emoji: '🎁',
        priority: 'should',
        orderIndex: 2,
        funding: {
          amount: exact(4_000),
          cadence: { kind: 'everyNth', n: 3, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-envelope-trip',
      payload: {
        name: 'Weekend away',
        emoji: null,
        priority: 'want',
        orderIndex: 1,
        funding: {
          amount: exact(20_000),
          cadence: {
            kind: 'chosen',
            dayKeys: [paydayKey(0), paydayKey(2), paydayKey(4)],
          },
        },
      },
    },
    {
      id: 'seed-envelope-savings',
      payload: {
        name: 'Savings',
        emoji: '💰',
        priority: 'should',
        orderIndex: 3,
        funding: {
          amount: { kind: 'percent', bps: 1_000, of: 'dayMoney' },
          cadence: { kind: 'everyIncomeDay' },
        },
      },
    },
    {
      id: 'seed-envelope-everyday',
      payload: {
        name: 'Everyday spending',
        emoji: null,
        priority: 'want',
        orderIndex: 2,
        funding: {
          amount: { kind: 'rest' },
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
      },
    },
  ];

  const sealedChanges = await Promise.all(
    envelopes.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedEnvelopes = await Promise.all(
    envelopes.map(({ payload }) => sealJson(payload, encryption)),
  );

  const batch = context.firestore.batch();
  envelopes.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'envelope', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'envelope',
        createdAt,
        today,
        changeId,
        sealedEnvelopes[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  await batch.commit();
  return envelopes.length * 3;
}

/** Four bills: rent that repeats monthly, a one-time bill, a bill chosen across three paydays and a bill that ends after six payments. */
async function writeSeedBills(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 11 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ lowCents: cents, highCents: cents });
  const never = { onDate: null, afterCount: null };
  const dayOfNextMonth = (day: number) => {
    const now = new Date(today);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day);
  };

  const bills: { id: string; payload: BillSealed }[] = [
    {
      id: 'seed-bill-rent',
      payload: {
        name: 'Rent',
        emoji: '🏠',
        priority: 'must',
        orderIndex: 1,
        amount: exact(125_000),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'monthly',
            anchor: dayOfNextMonth(1),
            monthDays: [1],
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
      },
    },
    {
      id: 'seed-bill-car',
      payload: {
        name: 'Car registration',
        emoji: null,
        priority: 'must',
        orderIndex: 2,
        amount: exact(18_500),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'once',
            anchor: today + 40 * DAY_MS,
            monthDays: [],
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
      },
    },
    {
      id: 'seed-bill-dentist',
      payload: {
        name: 'Dentist',
        emoji: '🦷',
        priority: 'should',
        orderIndex: 1,
        amount: exact(30_000),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'once',
            anchor: today + 36 * DAY_MS,
            monthDays: [],
          },
        },
        ending: never,
        fundedBy: {
          kind: 'chosen',
          dayKeys: [paydayKey(0), paydayKey(1), paydayKey(2)],
        },
      },
    },
    {
      id: 'seed-bill-laptop',
      payload: {
        name: 'Laptop payment plan',
        emoji: null,
        priority: 'should',
        orderIndex: 2,
        amount: exact(8_900),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'monthly',
            anchor: dayOfNextMonth(15),
            monthDays: [15],
          },
        },
        ending: { onDate: null, afterCount: 6 },
        fundedBy: { kind: 'suggested' },
      },
    },
  ];

  const sealedChanges = await Promise.all(
    bills.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedBills = await Promise.all(
    bills.map(({ payload }) => sealJson(payload, encryption)),
  );

  const batch = context.firestore.batch();
  bills.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'bill', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'bill',
        createdAt,
        today,
        changeId,
        sealedBills[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  await batch.commit();
  return bills.length * 3;
}

/** Three goals: one with a date that lands exactly on pace, one with no date, and one the plan fills on the first income day. */
async function writeSeedGoals(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 10 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const paydayKey = (index: number) =>
    toDayKey('seed-income-paycheck', firstPayday + index * 14 * DAY_MS);
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });

  const goals: { id: string; payload: GoalSealed }[] = [
    {
      id: 'seed-goal-vacation',
      payload: {
        name: 'Vacation fund',
        emoji: '🏖️',
        priority: 'want',
        orderIndex: 1,
        targetCents: 180_000,
        targetDate: today + 50 * DAY_MS,
        funding: { amount: exact(30_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-goal-cushion',
      payload: {
        name: 'Emergency cushion',
        emoji: null,
        priority: 'should',
        orderIndex: 1,
        targetCents: 60_000,
        targetDate: null,
        funding: {
          amount: exact(15_000),
          cadence: { kind: 'everyNth', n: 2, anchorDayKey: paydayKey(0) },
        },
      },
    },
    {
      id: 'seed-goal-phone',
      payload: {
        name: 'New phone',
        emoji: '📱',
        priority: 'should',
        orderIndex: 2,
        targetCents: 20_000,
        targetDate: today + 30 * DAY_MS,
        funding: { amount: exact(20_000), cadence: { kind: 'everyIncomeDay' } },
      },
    },
    {
      id: 'seed-goal-repairs',
      payload: {
        name: 'Home repairs',
        emoji: null,
        priority: 'should',
        orderIndex: 3,
        targetCents: 200_000,
        targetDate: null,
        funding: {
          amount: { kind: 'percent', bps: 500, of: 'dayMoney' },
          cadence: { kind: 'everyIncomeDay' },
        },
      },
    },
  ];

  const sealedChanges = await Promise.all(
    goals.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const sealedGoals = await Promise.all(
    goals.map(({ payload }) => sealJson(payload, encryption)),
  );

  const batch = context.firestore.batch();
  goals.forEach(({ id }, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${id}`;
    batch.set(
      context.firestore.doc(`${plan}/items/${id}`),
      header(id, 'goal', null, createdAt),
    );
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${id}`),
      version(
        `seed-version-${id}`,
        id,
        'goal',
        createdAt,
        today,
        changeId,
        sealedGoals[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, today, [id], sealedChanges[index]),
    );
  });
  await batch.commit();
  return goals.length * 3;
}
