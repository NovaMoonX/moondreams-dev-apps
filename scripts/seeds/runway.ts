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
import {
  applyLineEdits,
  getLineDifferences,
  getRemainder,
} from '../../src/apps/runway/engine/differences.ts';
import {
  buildCorrection,
  getCorrectionId,
} from '../../src/apps/runway/engine/correct.ts';
import { getPaidMoveId } from '../../src/apps/runway/engine/progress.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import type {
  ChangeSealed,
  BillPaidSealed,
  BillSealed,
  ConfirmedSealed,
  DayOverrideSealed,
  ProposedSealed,
  RecordLine,
  EnvelopeSealed,
  GoalSealed,
  IncomeDayDoc,
  MoveDoc,
  PayLineSealed,
  SourceSealed,
  StartHolding,
  StartSealed,
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
    startDate: startOfUtcDay(context.now) - 45 * DAY_MS,
    trackingPeriods: [],
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
  const lifecycleDocuments = await writeSeedLifecycle(
    context,
    owner.uid,
    encryption,
  );
  const startDocuments = await writeSeedStart(
    context,
    owner.uid,
    encryption,
    batch,
  );
  const historyDocuments = await writeSeedHistory(
    context,
    owner.uid,
    encryption,
  );
  const masterKeyIds = Object.keys(keyring.keys);
  masterKeyIds.forEach((masterKeyId) =>
    batch.set(
      context.firestore.doc(keyCheckPath(masterKeyId)),
      makeKeyCheck(keyring, masterKeyId, createdAt),
    ),
  );
  await batch.commit();
  const trackingDocuments = await seedTrackingPlan(context, keyring);

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      trackingDocuments +
      2 +
      incomeDocuments +
      envelopeDocuments +
      billDocuments +
      goalDocuments +
      lifecycleDocuments +
      startDocuments +
      historyDocuments +
      masterKeyIds.length,
  };
}

/** Items that change for a stretch or stop: Eating out at $40 for the next four income days then back to $80, Meal kit that ends in a month, an old phone plan that ended, a paused goal and an archived envelope. Each has its entries, the ended ones the `ended_` one. */
async function writeSeedLifecycle(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const addedAt = context.now - 9 * DAY_MS;
  const firstPayday = today + 3 * DAY_MS;
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });
  const money = (cents: number) => ({ lowCents: cents, highCents: cents });
  const daily = {
    amount: exact(0),
    cadence: { kind: 'everyIncomeDay' as const },
  };
  const funding = (cents: number) => ({ ...daily, amount: exact(cents) });
  const envelope = (
    name: string,
    emoji: string | null,
    cents: number,
    orderIndex: number,
  ): EnvelopeSealed => ({
    name,
    emoji,
    priority: 'want',
    orderIndex,
    funding: funding(cents),
  });
  const phonePlan: BillSealed = {
    name: 'Old phone plan',
    emoji: null,
    priority: 'should',
    orderIndex: 9,
    amount: money(4_500),
    timing: {
      kind: 'date',
      schedule: {
        kind: 'monthly',
        anchor: today - 90 * DAY_MS,
        monthDays: [5],
      },
    },
    ending: { onDate: null, afterCount: null },
    fundedBy: { kind: 'suggested' },
    stanceOverride: null,
  };
  const pausedGoal: GoalSealed = {
    name: 'Car repair',
    emoji: '🚗',
    priority: 'want',
    orderIndex: 5,
    targetCents: 90_000,
    targetDate: null,
    funding: funding(10_000),
    state: 'paused',
  };

  const stretchEnd = firstPayday + 17 * DAY_MS + DAY_MS;
  const items = [
    {
      id: 'seed-envelope-eating-out',
      kind: 'envelope',
      payload: envelope('Eating out', '🍜', 8_000, 8),
    },
    {
      id: 'seed-envelope-meal-kit',
      kind: 'envelope',
      payload: envelope('Meal kit', null, 3_500, 9),
      endedAt: today + 30 * DAY_MS,
    },
    {
      id: 'seed-bill-old-phone',
      kind: 'bill',
      payload: phonePlan,
      endedAt: today - 20 * DAY_MS,
    },
    { id: 'seed-goal-car-repair', kind: 'goal', payload: pausedGoal },
    {
      id: 'seed-envelope-old-hobby',
      kind: 'envelope',
      payload: envelope('Pottery class', '🏺', 2_500, 10),
      archivedAt: today - 5 * DAY_MS,
    },
  ] as const;

  const sealed = await Promise.all(
    items.map(({ payload }) => sealJson(payload, encryption)),
  );
  const addedChanges = await Promise.all(
    items.map(({ payload }) =>
      sealJson(
        { summary: `Added ${payload.name}.` } satisfies ChangeSealed,
        encryption,
      ),
    ),
  );
  const stretchPayload = envelope('Eating out', '🍜', 4_000, 8);
  const [
    stretchSealed,
    stretchChange,
    mealKitEnded,
    phoneEnded,
    hobbyArchived,
  ] = await Promise.all([
    sealJson(stretchPayload, encryption),
    sealJson(
      {
        summary: `Eating out: Funding $80.00 every income day to $40.00 every income day, from ${new Date(today).toISOString().slice(0, 10)} through ${new Date(stretchEnd - DAY_MS).toISOString().slice(0, 10)}, then it goes back.`,
        note: 'Covering the car registration',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Meal kit: ended after its last box.',
        note: 'Cancelling the subscription',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Old phone plan: ended.',
        note: 'Switched to a cheaper plan',
      } satisfies ChangeSealed,
      encryption,
    ),
    sealJson(
      {
        summary: 'Pottery class: archived.',
        note: 'Finished the course',
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);

  const batch = context.firestore.batch();
  items.forEach((entry, index) => {
    const createdAt = addedAt + index * 1000;
    const changeId = `seed-change-${entry.id}`;
    const startsOn =
      entry.id === 'seed-bill-old-phone' ? today - 90 * DAY_MS : today;
    batch.set(context.firestore.doc(`${plan}/items/${entry.id}`), {
      ...header(entry.id, entry.kind, null, createdAt),
      endedAt: 'endedAt' in entry ? entry.endedAt : null,
      archivedAt: 'archivedAt' in entry ? entry.archivedAt : null,
    });
    batch.set(
      context.firestore.doc(`${plan}/versions/seed-version-${entry.id}`),
      version(
        `seed-version-${entry.id}`,
        entry.id,
        entry.kind,
        createdAt,
        startsOn,
        changeId,
        sealed[index],
      ),
    );
    batch.set(
      context.firestore.doc(`${plan}/changes/${changeId}`),
      change(changeId, createdAt, startsOn, [entry.id], addedChanges[index]),
    );
  });
  const stretchAt = context.now - 2 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-eating-out-stretch`),
    {
      ...version(
        'seed-version-eating-out-stretch',
        'seed-envelope-eating-out',
        'envelope',
        stretchAt,
        today,
        'seed-change-eating-out-stretch',
        stretchSealed,
      ),
      effectiveUntil: stretchEnd,
    },
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-eating-out-stretch`),
    change(
      'seed-change-eating-out-stretch',
      stretchAt,
      today,
      ['seed-envelope-eating-out'],
      stretchChange,
    ),
  );
  const endedEntry = (itemId: string, on: number, sealedEntry: unknown) => ({
    id: `ended_${itemId}`,
    kind: 'ended',
    createdAt: stretchAt,
    effectiveFrom: on,
    itemIds: [itemId],
    sealed: sealedEntry,
  });
  batch.set(
    context.firestore.doc(`${plan}/changes/ended_seed-envelope-meal-kit`),
    endedEntry('seed-envelope-meal-kit', today + 30 * DAY_MS, mealKitEnded),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/ended_seed-bill-old-phone`),
    endedEntry('seed-bill-old-phone', today - 20 * DAY_MS, phoneEnded),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-old-hobby-archived`),
    change(
      'seed-change-old-hobby-archived',
      stretchAt,
      today - 5 * DAY_MS,
      ['seed-envelope-old-hobby'],
      hobbyArchived,
    ),
  );
  await batch.commit();
  return items.length * 3 + 5;
}

const HISTORY_ITEMS = [
  ['seed-envelope-groceries', 'Groceries'],
  ['seed-envelope-gas', 'Gas'],
  ['seed-goal-vacation', 'Vacation fund'],
] as const;

/** Sixty older changes, fifty of them in the 90 days before the recent ones so one window holds 50 entries and paging back finds them, one that was made 45 days ago for a day later confirmed, and one sealed under a key this plan does not have, which the log shows as unreadable. */
async function writeSeedHistory(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
) {
  const plan = `apps/runway/plans/${uid}`;
  const today = startOfUtcDay(context.now);
  const notes = ['Prices went up', null, 'Covering the car registration'];
  const entries = Array.from({ length: 60 }, (_, index) => {
    const [itemId, name] = HISTORY_ITEMS[index % HISTORY_ITEMS.length];
    const age = index < 50 ? 100 + index * 0.55 : 130 + (index - 50) * 28;
    const cents = 20_000 + index * 500;
    return {
      id: `seed-history-${index}`,
      itemId,
      createdAt: today - Math.round(age * DAY_MS),
      summary: `${name}: Funding $${(cents / 100).toFixed(2)} every income day to $${((cents + 500) / 100).toFixed(2)} every income day, from now on.`,
      note: notes[index % notes.length],
    };
  });
  const linked = {
    id: 'seed-history-confirmed-day',
    itemId: 'seed-envelope-groceries',
    createdAt: today - 45 * DAY_MS,
    summary:
      'Groceries: Funding $150.00 every income day to $160.00 every income day, from now on.',
    note: 'Before the bonus',
  };
  const wrongKey = {
    ...encryption,
    key: 'ab'.repeat(32),
  };
  const all = [
    ...entries,
    linked,
    {
      id: 'seed-history-unreadable',
      itemId: 'seed-envelope-gas',
      createdAt: today - 60 * DAY_MS,
      summary: 'Gas: Funding changed.',
      note: null,
    },
  ];
  const sealedEntries = await Promise.all(
    all.map((entry) =>
      sealJson(
        { summary: entry.summary, note: entry.note } satisfies ChangeSealed,
        entry.id === 'seed-history-unreadable' ? wrongKey : encryption,
      ),
    ),
  );
  const batch = context.firestore.batch();
  all.forEach((entry, index) =>
    batch.set(
      context.firestore.doc(`${plan}/changes/${entry.id}`),
      change(
        entry.id,
        entry.createdAt,
        entry.createdAt,
        [entry.itemId],
        sealedEntries[index],
      ),
    ),
  );
  await batch.commit();
  return all.length;
}

/** The starting point, 45 days back so every confirmed day counts: $3,400.00 on hand, two goals part-filled and two bills part set aside. One change and five holdings. */
async function writeSeedStart(
  context: SeedContext,
  uid: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
) {
  const plan = `apps/runway/plans/${uid}`;
  const startDate = startOfUtcDay(context.now) - 45 * DAY_MS;
  const createdAt = context.now - 14 * DAY_MS;
  const holdings: {
    refId: string | null;
    holding: StartHolding;
    cents: number;
  }[] = [
    { refId: null, holding: 'money', cents: 340_000 },
    { refId: 'seed-goal-vacation', holding: 'goal', cents: 25_000 },
    { refId: 'seed-goal-cushion', holding: 'goal', cents: 20_000 },
    { refId: 'seed-bill-rent', holding: 'bill', cents: 45_000 },
    { refId: 'seed-bill-car', holding: 'bill', cents: 6_000 },
  ];
  const changeId = 'seed-change-start';
  batch.set(context.firestore.doc(`${plan}/changes/${changeId}`), {
    id: changeId,
    kind: 'start',
    createdAt,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: await sealJson(
      {
        summary: `Started from ${new Date(startDate).toISOString().slice(0, 10)}.`,
      } satisfies ChangeSealed,
      encryption,
    ),
  });
  await Promise.all(
    holdings.map(async ({ refId, holding, cents }) => {
      const id = `start_${refId ?? 'money'}_${createdAt}`;
      const move: MoveDoc = {
        id,
        kind: 'start',
        date: startDate,
        refId,
        reversesMoveId: null,
        createdAt,
        sealed: await sealJson(
          { amountCents: cents, holding } satisfies StartSealed,
          encryption,
        ),
      };
      batch.set(context.firestore.doc(`${plan}/moves/${id}`), move);
    }),
  );
  return 1 + holdings.length;
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

  const source: SourceSealed = { name: 'Northwind Studio', pairings: [] };
  const paycheck: PayLineSealed = {
    name: 'Paycheck',
    schedule: { kind: 'everyOtherWeek', anchor: firstPayday, monthDays: [] },
    amount: { lowCents: 214_000, highCents: 214_000 },
    ending: { onDate: null, afterCount: 6 },
    stanceOverride: null,
    pairings: [
      {
        targetItemId: 'seed-envelope-groceries',
        amount: { kind: 'exact', cents: 30_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const bonus: PayLineSealed = {
    name: 'Spring bonus',
    schedule: { kind: 'once', anchor: bonusDay, monthDays: [] },
    amount: { lowCents: 90_000, highCents: 90_000 },
    ending: { onDate: null, afterCount: null },
    stanceOverride: null,
    pairings: [
      {
        targetItemId: 'seed-envelope-savings',
        amount: { kind: 'exact', cents: 95_000 },
        topUpFromAnySource: true,
      },
      {
        targetItemId: 'seed-envelope-trip',
        amount: { kind: 'exact', cents: 20_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const freelance: PayLineSealed = {
    name: 'Freelance payment',
    schedule: { kind: 'once', anchor: freelanceDay, monthDays: [] },
    amount: { lowCents: 12_000, highCents: 18_000 },
    ending: { onDate: null, afterCount: null },
    stanceOverride: null,
    pairings: [
      {
        targetItemId: 'seed-bill-rent',
        amount: { kind: 'exact', cents: 15_000 },
        topUpFromAnySource: false,
      },
    ],
  };
  const summaries: ChangeSealed[] = [
    { summary: 'Added Paycheck from Northwind Studio, $2,140.00.' },
    { summary: 'Added Spring bonus from Northwind Studio, $900.00.' },
    {
      summary:
        'Added Freelance payment from Northwind Studio, $120.00 to $180.00.',
    },
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
  const override: DayOverrideSealed = {
    pairings: null,
    holdResolutions: { 'seed-envelope-trip': 'leaveShort' },
  };
  const bonusDayId = toDayKey(ids.bonus, bonusDay);
  const overrideDoc: IncomeDayDoc = {
    id: bonusDayId,
    payLineId: ids.bonus,
    sourceId: ids.source,
    expectedOn: bonusDay,
    arrivedOn: null,
    status: 'draft',
    createdAt: addedAt + 3 * DAY_MS,
    confirmedAt: null,
    doneLineIds: [],
    sealed: await sealJson(override, encryption),
  };
  batch.set(context.firestore.doc(`${plan}/days/${bonusDayId}`), overrideDoc);
  const pastDays = await writeSeedConfirmedDays(
    context,
    plan,
    ids,
    encryption,
    batch,
    {
      addedAt,
      today,
    },
  );
  await batch.commit();
  return 12 + pastDays;
}

const seedLine = (
  dayId: string,
  itemId: string,
  name: string,
  emoji: string | null,
  tier: RecordLine['tier'],
  cents: number,
): RecordLine => ({
  lineId: `${dayId}:${itemId}`,
  itemId,
  name,
  emoji,
  tier,
  demandCents: cents,
  cents,
  shortBy: 0,
  paidBy: [{ dayId, cents }],
});

/** Two paydays that already arrived, sealed the way a confirmation seals them: one as expected, one with more than expected and a note. The first funds the emergency cushion, so that goal starts partly held. */
async function writeSeedConfirmedDays(
  context: SeedContext,
  plan: string,
  ids: { source: string; paycheck: string },
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
  when: { addedAt: number; today: number },
) {
  const days = [
    {
      on: when.today - 11 * DAY_MS,
      arrivedCents: 214_000,
      note: null,
      withCushion: true,
      withBills: true,
    },
    {
      on: when.today - 25 * DAY_MS,
      arrivedCents: 226_000,
      note: 'Overtime',
      withCushion: false,
      withBills: false,
    },
    {
      on: when.today - 39 * DAY_MS,
      arrivedCents: 224_000,
      note: 'Bonus from the quarter',
      withCushion: false,
      withBills: false,
      edits: {
        'seed-envelope-groceries': 12_000,
        'seed-goal-vacation': 40_000,
      },
      lineNotes: {
        'seed-goal-vacation': 'Sent the bonus to the trip',
      } as Record<string, string | null>,
      correction: {
        edits: { 'seed-goal-vacation': 30_000 },
        note: 'Only $300 went to the trip',
      },
    },
  ];
  const docs = await Promise.all(
    days.map(async (entry) => {
      const { on, arrivedCents, note, withCushion, withBills } = entry;
      const byLine = (
        values: Record<string, never> | Record<string, number | string | null>,
      ) =>
        Object.fromEntries(
          Object.entries(values).map(([itemId, value]) => [
            `${dayId}:${itemId}`,
            value,
          ]),
        );
      const dayId = toDayKey(ids.paycheck, on);
      const lines = [
        seedLine(
          dayId,
          'seed-envelope-groceries',
          'Groceries',
          '🛒',
          'must',
          15_000,
        ),
        ...(withCushion
          ? [
              seedLine(
                dayId,
                'seed-goal-cushion',
                'Emergency cushion',
                null,
                'should',
                15_000,
              ),
            ]
          : []),
        seedLine(
          dayId,
          'seed-goal-vacation',
          'Vacation fund',
          '🏖️',
          'want',
          30_000,
        ),
        ...(withBills
          ? [
              seedLine(dayId, 'seed-bill-rent', 'Rent', '🏠', 'must', 62_500),
              seedLine(
                dayId,
                'seed-bill-car',
                'Car registration',
                null,
                'must',
                18_500,
              ),
              seedLine(
                dayId,
                'seed-bill-laptop',
                'Laptop payment plan',
                null,
                'should',
                5_000,
              ),
            ]
          : []),
      ];
      const funded = lines.reduce((sum, line) => sum + line.cents, 0);
      const proposed: ProposedSealed = {
        fingerprint: 'seed',
        stance: 'conservative',
        expectedCents: 214_000,
        freeToSpendCents: 214_000 - funded,
        lines,
      };
      const confirmedLines = applyLineEdits(
        lines,
        byLine('edits' in entry ? entry.edits : {}) as Record<string, number>,
        dayId,
      );
      const confirmed: ConfirmedSealed = {
        fingerprint: 'seed',
        stance: 'conservative',
        arrivedCents,
        expectedCents: 214_000,
        freeToSpendCents: getRemainder(arrivedCents, confirmedLines),
        lines: confirmedLines,
        differences: [
          ...(arrivedCents === 214_000
            ? []
            : [
                {
                  kind: 'amount' as const,
                  plannedCents: 214_000,
                  actualCents: arrivedCents,
                  note,
                },
              ]),
          ...getLineDifferences(
            lines,
            confirmedLines,
            byLine('lineNotes' in entry ? entry.lineNotes : {}) as Record<
              string,
              string | null
            >,
          ),
        ],
      };
      const correction =
        'correction' in entry
          ? buildCorrection({
              base: {
                recordId: `${dayId}_confirmed`,
                dayId,
                kind: 'confirmed',
                stance: 'conservative',
                arrivedCents,
                freeToSpendCents: confirmed.freeToSpendCents,
                lines: confirmedLines,
              },
              arrivedCents,
              edits: byLine(entry.correction.edits) as Record<string, number>,
              note: entry.correction.note,
            })
          : null;
      return {
        dayId,
        on,
        arrivedCents,
        sealedCorrection: correction
          ? await sealJson(correction, encryption)
          : null,
        doneLineIds: withBills ? [`${dayId}:seed-bill-laptop`] : [],
        sealedDay: await sealJson(EMPTY_SEED_OVERRIDE, encryption),
        sealedProposed: await sealJson(proposed, encryption),
        sealedConfirmed: await sealJson(confirmed, encryption),
      };
    }),
  );
  docs.forEach((entry) => {
    const confirmedAt = entry.on + 9 * 3_600_000;
    const day: IncomeDayDoc = {
      id: entry.dayId,
      payLineId: ids.paycheck,
      sourceId: ids.source,
      expectedOn: entry.on,
      arrivedOn: entry.on,
      status: 'confirmed',
      createdAt: confirmedAt,
      confirmedAt,
      doneLineIds: entry.doneLineIds,
      sealed: entry.sealedDay,
    };
    batch.set(context.firestore.doc(`${plan}/days/${entry.dayId}`), day);
    (['proposed', 'confirmed'] as const).forEach((kind) =>
      batch.set(
        context.firestore.doc(
          `${plan}/days/${entry.dayId}/records/${entry.dayId}_${kind}`,
        ),
        {
          id: `${entry.dayId}_${kind}`,
          dayId: entry.dayId,
          kind,
          createdAt: confirmedAt,
          sealed:
            kind === 'proposed' ? entry.sealedProposed : entry.sealedConfirmed,
          supersedesId: null,
        },
      ),
    );
    if (entry.sealedCorrection) {
      const id = getCorrectionId(`${entry.dayId}_confirmed`);
      batch.set(
        context.firestore.doc(`${plan}/days/${entry.dayId}/records/${id}`),
        {
          id,
          dayId: entry.dayId,
          kind: 'correction',
          createdAt: confirmedAt + 2 * DAY_MS,
          sealed: entry.sealedCorrection,
          supersedesId: `${entry.dayId}_confirmed`,
        },
      );
    }
  });
  const paidAhead = await writeSeedPaidAhead(
    context,
    plan,
    encryption,
    batch,
    when.today,
  );
  return (
    docs.length * 3 +
    docs.filter((entry) => entry.sealedCorrection).length +
    paidAhead
  );
}

/** The laptop plan's next payment, marked paid ahead of its due date: $50.00 of it was set aside by the confirmed day, so $39.00 came from Free to spend (planned at the bill's own optimistic end, $89.00). */
async function writeSeedPaidAhead(
  context: SeedContext,
  plan: string,
  encryption: Parameters<typeof sealJson>[1],
  batch: ReturnType<SeedContext['firestore']['batch']>,
  today: number,
) {
  const now = new Date(today);
  const dueOn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15);
  const id = getPaidMoveId('seed-bill-laptop', dueOn, 0);
  const payload: BillPaidSealed = {
    amountCents: 8_900,
    paidOn: today - 2 * DAY_MS,
    fromFreeCents: 3_900,
  };
  const move: MoveDoc = {
    id,
    kind: 'billPaid',
    date: dueOn,
    refId: 'seed-bill-laptop',
    reversesMoveId: null,
    createdAt: today - 2 * DAY_MS + 10 * 3_600_000,
    sealed: await sealJson(payload, encryption),
  };
  batch.set(context.firestore.doc(`${plan}/moves/${id}`), move);
  return 1;
}

const EMPTY_SEED_OVERRIDE: DayOverrideSealed = {
  pairings: null,
  holdResolutions: {},
};

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

/** Four bills: rent that repeats monthly and goes up from a date two months ahead, a one-time bill, a bill chosen across three paydays and a bill that ends after six payments. */
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
        stanceOverride: null,
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
        stanceOverride: null,
      },
    },
    {
      id: 'seed-bill-dentist',
      payload: {
        name: 'Dentist',
        emoji: '🦷',
        priority: 'should',
        orderIndex: 1,
        amount: { lowCents: 30_000, highCents: 36_000 },
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
        stanceOverride: null,
      },
    },
    {
      id: 'seed-bill-laptop',
      payload: {
        name: 'Laptop payment plan',
        emoji: null,
        priority: 'should',
        orderIndex: 2,
        amount: { lowCents: 8_900, highCents: 9_900 },
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
        stanceOverride: 'optimistic',
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
  const raise = {
    ...bills[0].payload,
    amount: exact(130_000),
  } satisfies BillSealed;
  const raiseFromStart = Date.UTC(
    new Date(today).getUTCFullYear(),
    new Date(today).getUTCMonth() + 2,
    1,
  );
  const raiseText = new Date(raiseFromStart).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const [raiseSealed, raiseChangeSealed] = await Promise.all([
    sealJson(raise, encryption),
    sealJson(
      {
        summary: `Rent: Amount $1,250.00 to $1,300.00, from ${raiseText}.`,
        note: 'Lease renewal',
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const raiseCreatedAt = context.now - 2 * DAY_MS;
  batch.set(
    context.firestore.doc(`${plan}/versions/seed-version-rent-raise`),
    version(
      'seed-version-rent-raise',
      'seed-bill-rent',
      'bill',
      raiseCreatedAt,
      raiseFromStart,
      'seed-change-rent-raise',
      raiseSealed,
    ),
  );
  batch.set(
    context.firestore.doc(`${plan}/changes/seed-change-rent-raise`),
    change(
      'seed-change-rent-raise',
      raiseCreatedAt,
      raiseFromStart,
      ['seed-bill-rent'],
      raiseChangeSealed,
    ),
  );
  await batch.commit();
  return bills.length * 3 + 2;
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

/** Jamie's plan is already at Track: income, envelopes, bills and goals like Alex's, a starting point 45 days back that is also the day tracking began, what each envelope held that day, and the two records of the move up. Jamie's `trackingPeriods` has one open period. */
async function seedTrackingPlan(
  context: SeedContext,
  keyring: ReturnType<typeof readKeyring>,
) {
  const owner = FIXTURE_USERS.partnerTwo;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const createdAt = context.now - 14 * DAY_MS;
  const startDate = startOfUtcDay(context.now) - 45 * DAY_MS;
  const encryption = {
    appId: 'runway' as const,
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const plan = `apps/runway/plans/${owner.uid}`;

  const batch = context.firestore.batch();
  batch.set(
    context.firestore.doc(`apps/runway/server/${owner.uid}/keys/data`),
    wrapDataKey(keyring, owner.uid, data, createdAt),
  );
  batch.set(context.firestore.doc(plan), {
    uid: owner.uid,
    createdAt,
    updatedAt: createdAt,
    stance: 'conservative',
    startDate,
    trackingPeriods: [{ from: startDate, to: null }],
    keyId: data.keyId,
    sealed: await sealJson({ currencyCode: DEFAULT_CURRENCY_CODE }, encryption),
  });
  const moveId = `tracking_${new Date(startDate).toISOString().slice(0, 10).replaceAll('-', '')}_${createdAt}`;
  batch.set(context.firestore.doc(`${plan}/moves/${moveId}`), {
    id: moveId,
    kind: 'trackingChange',
    date: startDate,
    refId: null,
    reversesMoveId: null,
    createdAt,
    sealed: await sealJson({ direction: 'up' }, encryption),
  } satisfies MoveDoc);
  const envelopeStarts = [
    ['seed-envelope-groceries', 12_000],
    ['seed-envelope-gas', 4_000],
  ] as const;
  await Promise.all(
    envelopeStarts.map(async ([refId, cents]) => {
      const id = `start_${refId}_${createdAt}`;
      batch.set(context.firestore.doc(`${plan}/moves/${id}`), {
        id,
        kind: 'start',
        date: startDate,
        refId,
        reversesMoveId: null,
        createdAt,
        sealed: await sealJson(
          { amountCents: cents, holding: 'envelope' } satisfies StartSealed,
          encryption,
        ),
      } satisfies MoveDoc);
    }),
  );
  batch.set(context.firestore.doc(`${plan}/changes/seed-change-level-move`), {
    id: 'seed-change-level-move',
    kind: 'levelMove',
    createdAt,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: await sealJson(
      {
        summary: `Started tracking from ${new Date(startDate).toISOString().slice(0, 10)}.`,
      } satisfies ChangeSealed,
      encryption,
    ),
  });
  await batch.commit();

  const documents = [
    await writeSeedIncome(context, owner.uid, encryption),
    await writeSeedEnvelopes(context, owner.uid, encryption),
    await writeSeedBills(context, owner.uid, encryption),
    await writeSeedGoals(context, owner.uid, encryption),
  ].reduce((sum, count) => sum + count, 0);
  const startBatch = context.firestore.batch();
  const startDocuments = await writeSeedStart(
    context,
    owner.uid,
    encryption,
    startBatch,
  );
  await startBatch.commit();
  return 2 + 1 + envelopeStarts.length + 1 + documents + startDocuments;
}
