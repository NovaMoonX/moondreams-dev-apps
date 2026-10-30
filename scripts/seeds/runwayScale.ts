import {
  deriveSeedDataKey,
  wrapDataKey,
} from '../../functions/src/apps/runway/planKey.ts';
import { DEFAULT_CURRENCY_CODE } from '../../src/apps/runway/constants.ts';
import {
  DAY_MS,
  startOfUtcDay,
  toDayKey,
} from '../../src/apps/runway/engine/dates.ts';
import { getPaidMoveId } from '../../src/apps/runway/engine/progress.ts';
import { occurrences } from '../../src/apps/runway/engine/schedule.ts';
import { sealJson } from '../../src/apps/runway/security.ts';
import type {
  BillPaidSealed,
  BillSealed,
  ChangeSealed,
  ConfirmedSealed,
  EnvelopeSealed,
  GoalSealed,
  MoveDoc,
  PayLineSealed,
  Priority,
  ProposedSealed,
  PurchaseDoc,
  PurchaseLine,
  PurchaseSealed,
  RecordLine,
  Schedule,
  SourceSealed,
  StartSealed,
} from '../../src/apps/runway/types.ts';
import {
  change,
  header,
  readEmulatorKeyring,
  seedClosings,
  seedLine,
  version,
} from './runway.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const YEARS = 5;
const PURCHASE_COUNT = 25_000;
const BILL_COUNT = 60;
const ENVELOPE_COUNT = 25;
const GOAL_COUNT = 12;
/** Versions beyond each item's first; the total is this plus the items. `RUNWAY_SCALE_VERSIONS` raises it to the TDD's 2,000. */
const TARGET_VERSIONS = Number(process.env.RUNWAY_SCALE_VERSIONS ?? 600);
const HOUR_MS = 3_600_000;

type Encryption = Parameters<typeof sealJson>[1];

/** A small seeded generator so every run writes the same plan. */
function makeRandom(seed: number) {
  const state = { value: seed };
  const next = () => {
    state.value = (state.value + 0x6d2b79f5) | 0;
    const mixed = Math.imul(
      state.value ^ (state.value >>> 15),
      1 | state.value,
    );
    const result =
      ((mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed) >>> 0;
    return result / 4_294_967_296;
  };
  return next;
}

const random = makeRandom(20_260_425);
const pickOne = <T>(list: readonly T[]) =>
  list[Math.floor(random() * list.length)];

const ENVELOPE_NAMES = [
  'Groceries',
  'Gas',
  'Dining out',
  'Coffee',
  'Gifts',
  'Clothing',
  'Pets',
  'Household',
  'Kids activities',
  'Haircuts',
  'Date night',
  'Books and games',
  'Car care',
  'Pharmacy',
  'Streaming extras',
  'Hobbies',
  'Garden',
  'Lunch at work',
  'Parking and tolls',
  'Gym drop-ins',
  'School supplies',
  'Takeout',
  'Charity',
  'Weekend trips',
  'Everyday spending',
];
const BILL_NAMES = [
  'Rent',
  'Electric',
  'Water',
  'Internet',
  'Phone',
  'Car insurance',
  'Renters insurance',
  'Gym',
  'Music streaming',
  'Video streaming',
  'Cloud storage',
  'Dental plan',
  'Student loan',
  'Car payment',
  'Trash pickup',
  'Gas utility',
  'Pet insurance',
  'News subscription',
  'Meal prep service',
  'Storage unit',
];
const GOAL_NAMES = [
  'Emergency cushion',
  'Vacation fund',
  'New laptop',
  'Home repairs',
  'Car replacement',
  'Wedding gift',
  'Dental work',
  'Bike',
  'Holiday travel',
  'Moving costs',
  'Camera',
  'Furniture',
];
const MERCHANTS = [
  'Safeway',
  "Trader Joe's",
  'Costco',
  'Target',
  'Shell',
  'Chevron',
  'Ramen Ya',
  'Blue Bottle',
  'Walgreens',
  'Home Depot',
  'REI',
  'Farmers market',
  'Uniqlo',
  'Amazon',
  'Whole Foods',
  'Peet’s',
  'CVS',
  'Lyft',
  'Barnes & Noble',
  'Petco',
];
const EMOJI = [
  '🛒',
  '⛽',
  '🍜',
  '☕',
  '🎁',
  '👕',
  '🐾',
  '🏠',
  null,
  null,
  null,
];

const inChunks = <T>(
  list: readonly T[],
  size: number,
  handle: (slice: T[]) => Promise<void>,
) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, index) =>
    list.slice(index * size, (index + 1) * size),
  ).reduce(
    (previous, slice) => previous.then(() => handle(slice)),
    Promise.resolve(),
  );

const exact = (cents: number) => ({ lowCents: cents, highCents: cents });
const never = { onDate: null, afterCount: null };
const pad = (value: number) => String(value).padStart(3, '0');

interface PlanItem {
  id: string;
  kind: 'source' | 'payLine' | 'bill' | 'envelope' | 'goal';
  parentId: string | null;
  createdAt: number;
  payload: object;
  priority?: Priority;
}

/** Five years of one plan, sealed as the app seals it, for judging performance. Emulators only, and only when asked for (`npm run seed:runway-scale`); `seed:reset` brings the baseline back. The plan is shaped like one written before closings existed (no `dirtyFrom`, no closings), so the first open builds them: sixty months, once. `RUNWAY_SCALE_CLOSINGS=1` writes them as well, for judging every open after that. */
export async function seedRunwayScale(
  context: SeedContext,
): Promise<SeedResult> {
  const keyring = readEmulatorKeyring();
  const owner = FIXTURE_USERS.runwayScale;
  const data = deriveSeedDataKey(keyring, owner.uid);
  const encryption: Encryption = {
    appId: 'runway',
    keyId: data.keyId,
    keyVersion: 1,
    key: data.key.toString('hex'),
  };
  const today = startOfUtcDay(context.now);
  const startDate = today - 365 * YEARS * DAY_MS - 1 * DAY_MS;
  const plan = `apps/runway/plans/${owner.uid}`;
  const pending: { path: string; value: object }[] = [];
  const written = { count: 0 };
  const put = (path: string, value: object) => {
    written.count += 1;
    pending.push({ path, value });
  };

  const planCreatedAt = startDate - DAY_MS;
  put(`apps/runway/server/${owner.uid}/keys/data`, {
    ...wrapDataKey(keyring, owner.uid, data, planCreatedAt),
  });
  put(plan, {
    uid: owner.uid,
    createdAt: planCreatedAt,
    updatedAt: context.now,
    stance: 'conservative',
    startDate,
    trackingPeriods: [{ from: startDate, to: null }],
    keyId: data.keyId,
    sealed: await sealJson({ currencyCode: DEFAULT_CURRENCY_CODE }, encryption),
  });

  const firstPayday = startDate + 3 * DAY_MS;
  const paycheckId = 'scale-income-paycheck';
  const paycheckKey = (index: number) =>
    toDayKey(paycheckId, firstPayday + index * 14 * DAY_MS);

  const sources: PlanItem[] = [
    {
      id: 'scale-source-northwind',
      kind: 'source',
      parentId: null,
      createdAt: planCreatedAt,
      payload: {
        name: 'Northwind Studio',
        pairings: [],
      } satisfies SourceSealed,
    },
    {
      id: 'scale-source-clients',
      kind: 'source',
      parentId: null,
      createdAt: planCreatedAt + 1000,
      payload: {
        name: 'Freelance clients',
        pairings: [],
      } satisfies SourceSealed,
    },
    {
      id: 'scale-source-rental',
      kind: 'source',
      parentId: null,
      createdAt: planCreatedAt + 2000,
      payload: { name: 'Rental income', pairings: [] } satisfies SourceSealed,
    },
  ];
  const payLine = (
    id: string,
    parentId: string,
    name: string,
    schedule: Schedule,
    low: number,
    high: number,
    offset: number,
  ): PlanItem => ({
    id,
    kind: 'payLine',
    parentId,
    createdAt: planCreatedAt + offset,
    payload: {
      name,
      schedule,
      amount: { lowCents: low, highCents: high },
      ending: never,
      stanceOverride: null,
      pairings: [],
    } satisfies PayLineSealed,
  });
  const payLines = [
    payLine(
      paycheckId,
      sources[0].id,
      'Paycheck',
      { kind: 'everyOtherWeek', anchor: firstPayday, monthDays: [] },
      240_000,
      240_000,
      3000,
    ),
    payLine(
      'scale-income-retainer',
      sources[1].id,
      'Retainer',
      {
        kind: 'monthly',
        anchor: Date.UTC(
          new Date(startDate).getUTCFullYear(),
          new Date(startDate).getUTCMonth() + 1,
          5,
        ),
        monthDays: [5],
      },
      160_000,
      240_000,
      4000,
    ),
    payLine(
      'scale-income-rent-received',
      sources[2].id,
      'Rent received',
      {
        kind: 'twiceMonthly',
        anchor: Date.UTC(
          new Date(startDate).getUTCFullYear(),
          new Date(startDate).getUTCMonth() + 1,
          1,
        ),
        monthDays: [1, 15],
      },
      50_000,
      50_000,
      5000,
    ),
  ];

  const envelopeItems: PlanItem[] = Array.from(
    { length: ENVELOPE_COUNT },
    (_, index) => {
      const priority: Priority =
        index < 8 ? 'must' : index < 17 ? 'should' : 'want';
      const cents = 2_000 + ((index * 1_700) % 9_000);
      const n = index % 4 === 1 ? 2 : index % 4 === 2 ? 3 : 1;
      const payload: EnvelopeSealed = {
        name: ENVELOPE_NAMES[index],
        emoji: EMOJI[index % EMOJI.length],
        priority,
        orderIndex: index + 1,
        funding: {
          amount: { kind: 'exact', cents },
          cadence:
            n === 1
              ? { kind: 'everyIncomeDay' }
              : {
                  kind: 'everyNth',
                  n: n as 2 | 3,
                  anchorDayKey: paycheckKey(0),
                },
        },
      };
      return {
        id: `scale-envelope-${pad(index)}`,
        kind: 'envelope',
        parentId: null,
        createdAt: planCreatedAt + 10_000 + index * 1000,
        payload,
        priority,
      };
    },
  );
  const billItems: PlanItem[] = Array.from(
    { length: BILL_COUNT },
    (_, index) => {
      const priority: Priority =
        index < 22 ? 'must' : index < 44 ? 'should' : 'want';
      const startsLater = index >= 45;
      const createdAt = startsLater
        ? startDate + Math.round((0.15 + 0.14 * (index - 45)) * 365 * DAY_MS)
        : planCreatedAt + 40_000 + index * 1000;
      const dueDay = 1 + ((index * 7) % 28);
      const first = new Date(createdAt);
      const amount = 1_500 + ((index * 3_137) % 14_000);
      const payload: BillSealed = {
        name: `${BILL_NAMES[index % BILL_NAMES.length]}${index >= BILL_NAMES.length ? ` ${Math.floor(index / BILL_NAMES.length) + 1}` : ''}`,
        emoji: index % 6 === 0 ? '🏠' : null,
        priority,
        orderIndex: index + 1,
        amount:
          index % 5 === 3
            ? { lowCents: amount, highCents: amount + 2_000 }
            : exact(amount),
        timing: {
          kind: 'date',
          schedule: {
            kind: 'monthly',
            anchor: Date.UTC(
              first.getUTCFullYear(),
              first.getUTCMonth() + 1,
              dueDay,
            ),
            monthDays: [dueDay],
          },
        },
        ending: never,
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
        groupId: null,
      };
      return {
        id: `scale-bill-${pad(index)}`,
        kind: 'bill',
        parentId: null,
        createdAt,
        payload,
        priority,
      };
    },
  );
  const goalItems: PlanItem[] = Array.from(
    { length: GOAL_COUNT },
    (_, index) => {
      const priority: Priority =
        index < 3 ? 'must' : index < 8 ? 'should' : 'want';
      const createdAt = startDate + Math.round(index * 0.15 * 365 * DAY_MS);
      const payload: GoalSealed = {
        name: GOAL_NAMES[index],
        emoji: index % 3 === 0 ? '🎯' : null,
        priority,
        orderIndex: index + 1,
        targetCents: 100_000 + index * 60_000,
        targetDate: index % 2 === 0 ? createdAt + 900 * DAY_MS : null,
        funding: {
          amount: { kind: 'exact', cents: 3_000 + index * 600 },
          cadence: { kind: 'everyIncomeDay' },
        },
        state: 'active',
      };
      return {
        id: `scale-goal-${pad(index)}`,
        kind: 'goal',
        parentId: null,
        createdAt,
        payload,
        priority,
      };
    },
  );
  const items = [
    ...sources,
    ...payLines,
    ...envelopeItems,
    ...billItems,
    ...goalItems,
  ];

  const changeable = [...envelopeItems, ...billItems, ...goalItems];
  const laterCount = Math.max(0, TARGET_VERSIONS - items.length);
  const later = Array.from({ length: laterCount }, (_, index) => {
    const item = changeable[index % changeable.length];
    const span = today - item.createdAt - 10 * DAY_MS;
    const effectiveFrom = startOfUtcDay(
      item.createdAt +
        20 * DAY_MS +
        Math.floor(random() * Math.max(span - 20 * DAY_MS, DAY_MS)),
    );
    return { item, effectiveFrom, index };
  });
  const bumped = (payload: object, step: number): object => {
    const factor = 1 + 0.02 * step;
    if ('amount' in payload) {
      const amount = (payload as BillSealed).amount;
      return {
        ...payload,
        amount: {
          lowCents: Math.round(amount.lowCents * factor),
          highCents: Math.round(amount.highCents * factor),
        },
      };
    }
    const funding = (payload as EnvelopeSealed).funding;
    return funding.amount.kind === 'exact'
      ? {
          ...payload,
          funding: {
            ...funding,
            amount: {
              kind: 'exact',
              cents: Math.round(funding.amount.cents * factor),
            },
          },
        }
      : payload;
  };
  const laterByItem = later.reduce<Map<string, typeof later>>((acc, entry) => {
    acc.set(entry.item.id, [...(acc.get(entry.item.id) ?? []), entry]);
    return acc;
  }, new Map());

  const versionWrites = items.flatMap((item) => {
    const firstFrom = startOfUtcDay(item.createdAt);
    const own = [...(laterByItem.get(item.id) ?? [])].sort(
      (a, b) => a.effectiveFrom - b.effectiveFrom,
    );
    return [
      {
        id: `scale-version-${item.id}`,
        item,
        effectiveFrom: firstFrom,
        createdAt: item.createdAt,
        changeId: `scale-change-${item.id}`,
        payload: item.payload,
        summary: `Added ${(item.payload as { name: string }).name}.`,
        note: null as string | null,
      },
      ...own.map((entry, step) => ({
        id: `scale-version-${item.id}-${step + 1}`,
        item,
        effectiveFrom: entry.effectiveFrom,
        createdAt: entry.effectiveFrom - DAY_MS,
        changeId: `scale-change-${item.id}-${step + 1}`,
        payload: bumped(item.payload, step + 1),
        summary: `${(item.payload as { name: string }).name}: changed, from ${new Date(entry.effectiveFrom).toISOString().slice(0, 10)}.`,
        note: step % 3 === 0 ? 'Prices went up' : null,
      })),
    ];
  });

  await inChunks(versionWrites, 500, async (slice) => {
    const sealed = await Promise.all(
      slice.map(async (entry) => ({
        payload: await sealJson(entry.payload, encryption),
        change: await sealJson(
          { summary: entry.summary, note: entry.note } satisfies ChangeSealed,
          encryption,
        ),
      })),
    );
    slice.forEach((entry, index) => {
      put(
        `${plan}/versions/${entry.id}`,
        version(
          entry.id,
          entry.item.id,
          entry.item.kind,
          entry.createdAt,
          entry.effectiveFrom,
          entry.changeId,
          sealed[index].payload,
        ),
      );
      put(
        `${plan}/changes/${entry.changeId}`,
        change(
          entry.changeId,
          entry.createdAt,
          entry.effectiveFrom,
          [entry.item.id],
          sealed[index].change,
        ),
      );
    });
  });
  items.forEach((item) =>
    put(
      `${plan}/items/${item.id}`,
      header(item.id, item.kind, item.parentId, item.createdAt),
    ),
  );

  const startMoves: {
    refId: string | null;
    holding: StartSealed['holding'];
    cents: number;
  }[] = [
    { refId: null, holding: 'money', cents: 1_200_000 },
    ...envelopeItems.slice(0, 5).map((item) => ({
      refId: item.id,
      holding: 'envelope' as const,
      cents: 25_000,
    })),
    ...goalItems.slice(0, 2).map((item) => ({
      refId: item.id,
      holding: 'goal' as const,
      cents: 50_000,
    })),
  ];
  const moveSealed = await Promise.all(
    startMoves.map((entry) =>
      sealJson(
        {
          amountCents: entry.cents,
          holding: entry.holding,
        } satisfies StartSealed,
        encryption,
      ),
    ),
  );
  startMoves.forEach((entry, index) => {
    const id = `start_${entry.refId ?? 'money'}_${planCreatedAt}`;
    put(`${plan}/moves/${id}`, {
      id,
      kind: 'start',
      date: startDate,
      refId: entry.refId,
      reversesMoveId: null,
      createdAt: planCreatedAt,
      sealed: moveSealed[index],
    } satisfies MoveDoc);
  });
  const trackingId = `tracking_${new Date(startDate).toISOString().slice(0, 10).replaceAll('-', '')}_${planCreatedAt}`;
  put(`${plan}/moves/${trackingId}`, {
    id: trackingId,
    kind: 'trackingChange',
    date: startDate,
    refId: null,
    reversesMoveId: null,
    createdAt: planCreatedAt,
    sealed: await sealJson({ direction: 'up' }, encryption),
  } satisfies MoveDoc);
  put(`${plan}/changes/scale-change-start`, {
    id: 'scale-change-start',
    kind: 'start',
    createdAt: planCreatedAt,
    effectiveFrom: startDate,
    itemIds: [],
    sealed: await sealJson(
      { summary: 'Started tracking.' } satisfies ChangeSealed,
      encryption,
    ),
  });

  const incomeDays = payLines
    .flatMap((line) => {
      const body = line.payload as PayLineSealed;
      return occurrences(
        body.schedule,
        body.ending,
        startDate,
        today - DAY_MS,
      ).map((on) => ({ line, body, on, dayId: toDayKey(line.id, on) }));
    })
    .sort((a, b) => a.on - b.on || (a.dayId < b.dayId ? -1 : 1));

  const fundedByEnvelope = new Map<string, number>();
  const dayWrites = incomeDays.map((day, dayIndex) => {
    const arrivedCents = Math.round(
      (day.body.amount.lowCents + day.body.amount.highCents) / 2,
    );
    const live = (item: PlanItem) => item.createdAt <= day.on;
    const lines: RecordLine[] = [
      ...envelopeItems.filter(live).flatMap((item) => {
        const funding = (item.payload as EnvelopeSealed).funding;
        const n = funding.cadence.kind === 'everyNth' ? funding.cadence.n : 1;
        if (dayIndex % n !== 0 || funding.amount.kind !== 'exact') return [];
        const cents = Math.round(
          funding.amount.cents * Math.min(1, arrivedCents / 240_000),
        );
        fundedByEnvelope.set(
          item.id,
          (fundedByEnvelope.get(item.id) ?? 0) + cents,
        );
        return [
          seedLine(
            day.dayId,
            item.id,
            (item.payload as EnvelopeSealed).name,
            (item.payload as EnvelopeSealed).emoji,
            item.priority!,
            cents,
          ),
        ];
      }),
      ...goalItems
        .filter(live)
        .map((item) =>
          seedLine(
            day.dayId,
            item.id,
            (item.payload as GoalSealed).name,
            (item.payload as GoalSealed).emoji,
            item.priority!,
            Math.round(1_500 * Math.min(1, arrivedCents / 240_000)),
          ),
        ),
      ...billItems
        .filter(live)
        .filter((item) => (dayIndex + Number(item.id.slice(-3))) % 3 === 0)
        .map((item) => {
          const body = item.payload as BillSealed;
          return seedLine(
            day.dayId,
            item.id,
            body.name,
            body.emoji,
            item.priority!,
            Math.round(body.amount.highCents / 3),
          );
        }),
    ];
    const funded = lines.reduce((sum, line) => sum + line.cents, 0);
    const proposed: ProposedSealed = {
      fingerprint: 'scale',
      stance: 'conservative',
      expectedCents: arrivedCents,
      freeToSpendCents: arrivedCents - funded,
      lines,
    };
    const confirmed: ConfirmedSealed = {
      fingerprint: 'scale',
      stance: 'conservative',
      arrivedCents,
      expectedCents: arrivedCents,
      freeToSpendCents: arrivedCents - funded,
      lines,
      differences: [],
    };
    return { day, proposed, confirmed, arrivedCents };
  });
  await inChunks(dayWrites, 40, async (slice) => {
    const sealed = await Promise.all(
      slice.map(async (entry) => ({
        proposed: await sealJson(entry.proposed, encryption),
        confirmed: await sealJson(entry.confirmed, encryption),
      })),
    );
    slice.forEach((entry, index) => {
      const confirmedAt = entry.day.on + 9 * HOUR_MS;
      put(`${plan}/days/${entry.day.dayId}`, {
        id: entry.day.dayId,
        payLineId: entry.day.line.id,
        sourceId: entry.day.line.parentId,
        expectedOn: entry.day.on,
        arrivedOn: entry.day.on,
        status: 'confirmed',
        createdAt: confirmedAt,
        confirmedAt,
        doneLineIds: [],
        sealed: null,
      });
      (['proposed', 'confirmed'] as const).forEach((kind) =>
        put(
          `${plan}/days/${entry.day.dayId}/records/${entry.day.dayId}_${kind}`,
          {
            id: `${entry.day.dayId}_${kind}`,
            dayId: entry.day.dayId,
            kind,
            createdAt: confirmedAt,
            sealed: sealed[index][kind],
            supersedesId: null,
          },
        ),
      );
    });
  });

  const paidDays = billItems.flatMap((item, index) => {
    const body = item.payload as BillSealed;
    const from = index < 20 ? item.createdAt : today - 183 * DAY_MS;
    return occurrences(
      body.timing.schedule,
      never,
      startOfUtcDay(from),
      today - DAY_MS,
    ).map((dueOn) => ({ item, body, dueOn }));
  });
  await inChunks(paidDays, 500, async (slice) => {
    const sealed = await Promise.all(
      slice.map((entry) =>
        sealJson(
          {
            amountCents: entry.body.amount.highCents,
            paidOn: entry.dueOn,
            fromFreeCents: 0,
          } satisfies BillPaidSealed,
          encryption,
        ),
      ),
    );
    slice.forEach((entry, index) => {
      const id = getPaidMoveId(entry.item.id, entry.dueOn, 0);
      put(`${plan}/moves/${id}`, {
        id,
        kind: 'billPaid',
        date: entry.dueOn,
        refId: entry.item.id,
        reversesMoveId: null,
        createdAt: entry.dueOn + 10 * HOUR_MS,
        sealed: sealed[index],
      } satisfies MoveDoc);
    });
  });

  const funded = envelopeItems.map((item) => ({
    item,
    weight: fundedByEnvelope.get(item.id) ?? 1,
  }));
  const totalWeight = funded.reduce((sum, entry) => sum + entry.weight, 0);
  const averageCents = Math.max(
    300,
    Math.round((0.9 * totalWeight) / PURCHASE_COUNT),
  );
  const pickEnvelope = () => {
    const target = random() * totalWeight;
    const found = funded.reduce<{ sum: number; id: string | null }>(
      (acc, entry) =>
        acc.id !== null
          ? acc
          : acc.sum + entry.weight >= target
            ? { sum: acc.sum, id: entry.item.id }
            : { sum: acc.sum + entry.weight, id: null },
      { sum: 0, id: null },
    );
    return found.id ?? funded[0].item.id;
  };
  const span = today - startDate;
  const purchases = Array.from({ length: PURCHASE_COUNT }, (_, index) => {
    const date = startOfUtcDay(
      startDate + Math.floor((index * span) / PURCHASE_COUNT),
    );
    const createdAt = date + 8 * HOUR_MS + Math.floor(random() * 12 * HOUR_MS);
    const amountCents = Math.max(
      100,
      Math.round(averageCents * (0.2 + random() * 1.6)),
    );
    const roll = random();
    const lines: PurchaseLine[] =
      roll < 0.07
        ? [
            {
              envelopeId: pickEnvelope(),
              cents: Math.ceil(amountCents / 2),
              via: 'chosen',
            },
            {
              envelopeId: pickEnvelope(),
              cents: Math.floor(amountCents / 2),
              via: 'chosen',
            },
          ]
        : roll < 0.1
          ? [{ envelopeId: null, cents: amountCents, via: 'free' }]
          : [{ envelopeId: pickEnvelope(), cents: amountCents, via: 'chosen' }];
    return {
      id: `scale-purchase-${String(index).padStart(5, '0')}`,
      date,
      createdAt,
      amountCents,
      lines,
      merchant: random() < 0.85 ? pickOne(MERCHANTS) : null,
      note:
        random() < 0.12
          ? pickOne([
              'Birthday',
              'Weekly shop',
              'Reimbursed later',
              'Split with Sam',
            ])
          : null,
    };
  });
  await inChunks(purchases, 1000, async (slice) => {
    const sealed = await Promise.all(
      slice.map((entry) =>
        sealJson(
          {
            amountCents: entry.amountCents,
            merchant: entry.merchant,
            label: null,
            note: entry.note,
            lines: entry.lines,
            refundOfId: null,
            link: null,
          } satisfies PurchaseSealed,
          encryption,
        ),
      ),
    );
    slice.forEach((entry, index) =>
      put(`${plan}/purchases/${entry.id}`, {
        id: entry.id,
        date: entry.date,
        source: 'manual',
        needsHome: false,
        expenseId: null,
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt,
        sealed: sealed[index],
      } satisfies PurchaseDoc),
    );
  });

  // The emulator commits one batch at a time and takes seconds over a few hundred sealed documents. A bulk writer sends many at once, so the first one waits behind the rest and its 60 second deadline expires; writing the batches one after another, once everything is built, never queues a batch behind another.
  const BATCH_SIZE = 200;
  await Array.from(
    { length: Math.ceil(pending.length / BATCH_SIZE) },
    (_, index) => pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  ).reduce(async (previous, slice) => {
    await previous;
    const batch = context.firestore.batch();
    slice.forEach(({ path, value }) =>
      batch.set(context.firestore.doc(path), value),
    );
    await batch.commit();
  }, Promise.resolve());
  const closingDocuments = process.env.RUNWAY_SCALE_CLOSINGS
    ? await seedClosings(context, owner.uid, encryption, startDate)
    : 0;
  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: written.count + closingDocuments,
  };
}
