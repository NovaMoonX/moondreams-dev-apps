// Pure checks for Runway's engine; run under several time zones: `TZ=America/Los_Angeles npm run check:runway-engine`.
import assert from 'node:assert/strict';

import { buildComingDays } from '../../src/apps/runway/engine/comingDays.ts';
import {
  DAY_MS,
  addUtcMonths,
  toDayKey,
  toDayStamp,
  todayAsUtcDate,
} from '../../src/apps/runway/engine/dates.ts';
import {
  buildDemands,
  planBillPayments,
  type DraftBillInput,
  type DraftGoalInput,
} from '../../src/apps/runway/engine/demands.ts';
import {
  buildDraft,
  type DraftInput,
} from '../../src/apps/runway/engine/draft.ts';
import {
  getPace,
  planGoalContributions,
} from '../../src/apps/runway/engine/pace.ts';
import {
  describeAmount,
  normalizeFunding,
} from '../../src/apps/runway/utils/fundingText.ts';
import { parsePercentToBps } from '../../src/utils/moneyUtils.ts';
import {
  allocate,
  percentOf,
  percentShares,
} from '../../src/apps/runway/engine/money.ts';
import {
  resolve,
  resolveCurrentOrNext,
  resolveVersion,
} from '../../src/apps/runway/engine/resolve.ts';
import {
  occurrences,
  selectFundedDays,
} from '../../src/apps/runway/engine/schedule.ts';
import type {
  Ending,
  OpenVersion,
  PlanItemDoc,
  Schedule,
} from '../../src/apps/runway/types.ts';

const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);
const stamps = (dates: number[]) => dates.map(toDayStamp);
const NEVER: Ending = { onDate: null, afterCount: null };

const makeRandom = (seed: number) => () => {
  const next = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  seed = next;
  return next / 2 ** 32;
};
const shuffled = <T>(list: readonly T[], random: () => number) =>
  list
    .map((value) => ({ value, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.value);

// Money.
assert.equal(percentOf(10_001, 2_500), 2_500, 'percentOf floors');
assert.equal(
  percentOf(1_000_000_000_00, 2_500),
  25_000_000_000,
  'percentOf at a large balance',
);
assert.deepEqual(
  allocate(100, [1, 1, 1], ['a', 'b', 'c']),
  [34, 33, 33],
  'tie goes to the lowest id',
);
assert.deepEqual(
  allocate(100, [1, 1, 1], ['c', 'b', 'a']),
  [33, 33, 34],
  'ties follow ids, not position',
);
assert.deepEqual(
  allocate(10, [5, 3, 2], ['a', 'b', 'c']),
  [5, 3, 2],
  'exact weights split exactly',
);
assert.deepEqual(allocate(0, [1, 2], ['a', 'b']), [0, 0]);
assert.deepEqual(
  allocate(5, [0, 0], ['a', 'b']),
  [0, 0],
  'no weight gives nothing',
);
assert.deepEqual(
  allocate(-100, [1, 1, 1], ['a', 'b', 'c']),
  [-34, -33, -33],
  'a negative total splits the same way',
);
assert.deepEqual(
  allocate(7, [1, 0, 2], ['a', 'b', 'c']),
  [2, 0, 5],
  'largest remainder wins the spare cent',
);
{
  const random = makeRandom(7);
  Array.from({ length: 300 }, (_, round) => round).forEach(() => {
    const count = 1 + Math.floor(random() * 8);
    const ids = Array.from({ length: count }, (_, index) => `id${index}`);
    const weights = ids.map(() => Math.floor(random() * 50));
    const total = Math.floor(random() * 200_000) - 50_000;
    const shares = allocate(total, weights, ids);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    assert.equal(
      shares.reduce((sum, share) => sum + share, 0),
      weightSum === 0 ? 0 : total,
      'shares add up to the total',
    );
    const order = shuffled(
      ids.map((_, index) => index),
      random,
    );
    const permuted = allocate(
      total,
      order.map((index) => weights[index]),
      order.map((index) => ids[index]),
    );
    ids.forEach((_, index) =>
      assert.equal(
        permuted[order.indexOf(index)],
        shares[index],
        'shares do not depend on input order',
      ),
    );
  });
}

// Dates.
assert.equal(toDayKey('pl1', utc(2026, 3, 9)), 'pl1_20260309');
assert.equal(toDayStamp(utc(2026, 12, 1)), '20261201');
assert.equal(
  addUtcMonths(utc(2026, 1, 31), 1),
  utc(2026, 2, 28),
  'month math clamps',
);
assert.equal(addUtcMonths(utc(2026, 10, 23), 12), utc(2027, 10, 23));
{
  const lateEvening = Date.UTC(2026, 2, 1, 3, 0, 0);
  const expected =
    process.env.TZ === 'America/Los_Angeles' ? utc(2026, 2, 28) : undefined;
  if (expected !== undefined) {
    assert.equal(
      todayAsUtcDate(lateEvening),
      expected,
      'local evening west of UTC is still that local day',
    );
  }
  const today = todayAsUtcDate(lateEvening);
  assert.equal(today % DAY_MS, 0, 'today is a UTC midnight');
}

// Schedules.
const weekly: Schedule = {
  kind: 'weekly',
  anchor: utc(2026, 3, 6),
  monthDays: [],
};
assert.deepEqual(
  stamps(occurrences(weekly, NEVER, utc(2026, 3, 1), utc(2026, 3, 31))),
  ['20260306', '20260313', '20260320', '20260327'],
  'weekly steps 7 UTC days across the US clock change',
);
assert.deepEqual(
  stamps(
    occurrences(
      { ...weekly, kind: 'everyOtherWeek' },
      NEVER,
      utc(2026, 3, 1),
      utc(2026, 4, 10),
    ),
  ),
  ['20260306', '20260320', '20260403'],
);
assert.deepEqual(
  stamps(
    occurrences(
      { ...weekly, anchor: utc(2026, 3, 6) },
      NEVER,
      utc(2026, 3, 14),
      utc(2026, 3, 27),
    ),
  ),
  ['20260320', '20260327'],
  'from and to are inclusive window edges',
);
assert.deepEqual(
  occurrences(weekly, NEVER, utc(2026, 3, 7), utc(2026, 3, 8)),
  [],
  'a window with no payday is empty',
);

const thirty1: Schedule = {
  kind: 'monthly',
  anchor: utc(2026, 1, 31),
  monthDays: [31],
};
assert.deepEqual(
  stamps(occurrences(thirty1, NEVER, utc(2026, 1, 1), utc(2026, 6, 30))),
  ['20260131', '20260228', '20260331', '20260430', '20260531', '20260630'],
  'monthly on the 31st lands on each month last day',
);
assert.deepEqual(
  stamps(occurrences(thirty1, NEVER, utc(2028, 2, 1), utc(2028, 2, 29))),
  ['20280229'],
  'a leap February keeps its 29th',
);
assert.deepEqual(
  stamps(
    occurrences(
      { kind: 'monthly', anchor: utc(2026, 12, 15), monthDays: [15] },
      NEVER,
      utc(2026, 12, 1),
      utc(2027, 2, 28),
    ),
  ),
  ['20261215', '20270115', '20270215'],
  'monthly crosses a year',
);
assert.deepEqual(
  stamps(
    occurrences(
      { kind: 'twiceMonthly', anchor: utc(2026, 2, 1), monthDays: [31, 15] },
      NEVER,
      utc(2026, 2, 1),
      utc(2026, 4, 30),
    ),
  ),
  ['20260215', '20260228', '20260315', '20260331', '20260415', '20260430'],
  'twice a month sorts its days and clamps the long one',
);
assert.deepEqual(
  stamps(
    occurrences(
      { kind: 'twiceMonthly', anchor: utc(2026, 1, 30), monthDays: [30, 31] },
      NEVER,
      utc(2026, 1, 1),
      utc(2026, 3, 31),
    ),
  ),
  ['20260130', '20260131', '20260228', '20260330', '20260331'],
  'twice a month never lists a clamped day twice',
);
assert.deepEqual(
  stamps(
    occurrences(
      { kind: 'twiceMonthly', anchor: utc(2026, 2, 20), monthDays: [5, 20] },
      NEVER,
      utc(2026, 2, 1),
      utc(2026, 3, 31),
    ),
  ),
  ['20260220', '20260305', '20260320'],
  'nothing lands before the anchor',
);
assert.deepEqual(
  stamps(
    occurrences(
      { kind: 'once', anchor: utc(2026, 5, 4), monthDays: [] },
      NEVER,
      utc(2026, 1, 1),
      utc(2027, 1, 1),
    ),
  ),
  ['20260504'],
  'once is one day',
);
assert.deepEqual(
  occurrences(
    { kind: 'once', anchor: utc(2026, 5, 4), monthDays: [] },
    NEVER,
    utc(2026, 5, 5),
    utc(2027, 1, 1),
  ),
  [],
);
assert.deepEqual(
  occurrences(
    { kind: 'irregular', anchor: utc(2026, 5, 4), monthDays: [] },
    NEVER,
    0,
    utc(2030, 1, 1),
  ),
  [],
);
assert.deepEqual(
  occurrences(
    { kind: 'weekly', anchor: null, monthDays: [] },
    NEVER,
    0,
    utc(2030, 1, 1),
  ),
  [],
);

const threeTimes: Ending = { onDate: null, afterCount: 3 };
assert.equal(
  occurrences(weekly, threeTimes, 0, utc(2030, 1, 1)).length,
  3,
  'after 3 times gives exactly 3 days',
);
assert.deepEqual(
  stamps(occurrences(weekly, threeTimes, utc(2026, 3, 14), utc(2030, 1, 1))),
  ['20260320'],
  'a count ending counts the days already behind the window',
);
assert.deepEqual(
  stamps(
    occurrences(
      weekly,
      { onDate: utc(2026, 3, 20), afterCount: null },
      0,
      utc(2030, 1, 1),
    ),
  ),
  ['20260306', '20260313', '20260320'],
  'an end date covers its whole day',
);
assert.deepEqual(
  stamps(
    occurrences(
      weekly,
      { onDate: utc(2026, 3, 20), afterCount: 2 },
      0,
      utc(2030, 1, 1),
    ),
  ),
  ['20260306', '20260313'],
  'whichever ending comes first wins',
);
assert.equal(
  occurrences(
    { kind: 'weekly', anchor: utc(2000, 1, 1), monthDays: [] },
    NEVER,
    0,
    utc(2100, 1, 1),
  ).length,
  2_000,
  'a runaway schedule is capped',
);

// Resolve.
const item = (
  id: string,
  createdAt: number,
  over: Partial<PlanItemDoc> = {},
): PlanItemDoc => ({
  id,
  kind: 'source',
  parentId: null,
  createdAt,
  endedAt: null,
  archivedAt: null,
  ...over,
});
const version = (
  id: string,
  itemId: string,
  createdAt: number,
  effectiveFrom: number,
  name: string,
  effectiveUntil: number | null = null,
): OpenVersion => ({
  id,
  itemId,
  kind: 'source',
  createdAt,
  effectiveFrom,
  effectiveUntil,
  changeId: `c_${id}`,
  payload: { name },
});

{
  const versions = [
    version('v1', 'a', 100, utc(2026, 1, 1), 'first'),
    version('v2', 'a', 200, utc(2026, 6, 1), 'second'),
    version(
      'v3',
      'a',
      300,
      utc(2026, 3, 1),
      'later decision, earlier date',
      utc(2026, 4, 1),
    ),
    version('v4', 'a', 300, utc(2026, 9, 1), 'tie broken by id'),
    version('v5', 'a', 300, utc(2026, 9, 1), 'tie loser'),
  ];
  const nameOn = (list: OpenVersion[], on: number, knownAt?: number) => {
    const found = resolveVersion(list, 'a', on, knownAt);
    return found && found.kind === 'source' ? found.payload.name : null;
  };
  const random = makeRandom(11);
  Array.from({ length: 50 }, (_, round) => round).forEach(() => {
    const list = shuffled(versions, random);
    assert.equal(
      nameOn(list, utc(2025, 12, 31)),
      null,
      'nothing before the first version',
    );
    assert.equal(nameOn(list, utc(2026, 2, 1)), 'first');
    assert.equal(
      nameOn(list, utc(2026, 3, 15)),
      'later decision, earlier date',
      'the latest decision covering a date wins',
    );
    assert.equal(
      nameOn(list, utc(2026, 4, 1)),
      'first',
      'a stretch that has run out stops covering, the earlier version returns',
    );
    assert.equal(nameOn(list, utc(2026, 7, 1)), 'second');
    assert.equal(
      nameOn(list, utc(2026, 10, 1)),
      'tie loser',
      'equal createdAt falls to the greater id',
    );
    assert.equal(
      nameOn(list, utc(2026, 7, 1), 150 - DAY_MS),
      'first',
      'known at: versions made later are left out',
    );
    assert.equal(
      nameOn(list, utc(2026, 7, 1), 50 - DAY_MS),
      null,
      'known at: nothing was made yet',
    );
    assert.equal(
      nameOn(list, utc(2026, 7, 1), 199),
      'second',
      'known at keeps what was made that same day',
    );
  });
  assert.equal(
    resolveCurrentOrNext(versions, 'a', utc(2025, 1, 1))?.id,
    'v1',
    'an item that has not begun resolves to its first version',
  );
  assert.equal(resolveCurrentOrNext(versions, 'zzz', utc(2025, 1, 1)), null);

  const headers = [
    item('a', 5),
    item('b', 6, { endedAt: utc(2026, 2, 1) }),
    item('c', 7, { archivedAt: utc(2026, 2, 1) }),
  ];
  const all = [
    ...versions,
    version('vb', 'b', 1, utc(2026, 1, 1), 'b'),
    version('vc', 'c', 1, utc(2026, 1, 1), 'c'),
  ];
  const idsOn = (on: number) =>
    resolve(
      shuffled(headers, makeRandom(3)),
      shuffled(all, makeRandom(4)),
      on,
    ).map((entry) => entry.item.id);
  assert.deepEqual(idsOn(utc(2026, 1, 15)), ['a', 'b', 'c']);
  assert.deepEqual(
    idsOn(utc(2026, 2, 1)),
    ['a', 'b'],
    'an archived item has no later dates',
  );
  assert.deepEqual(
    idsOn(utc(2026, 2, 2)),
    ['a'],
    'an ended item has no later dates',
  );
}

// Coming days.
{
  const payLine = (
    id: string,
    createdAt: number,
    parentId: string,
  ): PlanItemDoc => ({
    id,
    kind: 'payLine',
    parentId,
    createdAt,
    endedAt: null,
    archivedAt: null,
  });
  const payVersion = (
    id: string,
    itemId: string,
    createdAt: number,
    effectiveFrom: number,
    schedule: Schedule,
    ending: Ending,
    cents: number,
  ): OpenVersion => ({
    id,
    itemId,
    kind: 'payLine',
    createdAt,
    effectiveFrom,
    effectiveUntil: null,
    changeId: `c_${id}`,
    payload: {
      name: `line ${itemId}`,
      schedule,
      amount: { lowCents: cents, highCents: cents },
      ending,
    },
  });
  const items = [
    item('src', 1),
    payLine('lineA', 2, 'src'),
    payLine('lineB', 3, 'src'),
  ];
  const versions: OpenVersion[] = [
    version('vs', 'src', 1, utc(2026, 1, 1), 'Acme'),
    payVersion(
      'va',
      'lineA',
      2,
      utc(2026, 1, 1),
      { kind: 'everyOtherWeek', anchor: utc(2026, 10, 23), monthDays: [] },
      { onDate: null, afterCount: 3 },
      200_000,
    ),
    payVersion(
      'vb',
      'lineB',
      3,
      utc(2026, 1, 1),
      { kind: 'once', anchor: utc(2026, 11, 2), monthDays: [] },
      NEVER,
      50_000,
    ),
    payVersion(
      'vb2',
      'lineB',
      4,
      utc(2026, 11, 1),
      { kind: 'once', anchor: utc(2026, 11, 2), monthDays: [] },
      NEVER,
      60_000,
    ),
  ];
  const today = utc(2026, 10, 23);
  const random = makeRandom(5);
  Array.from({ length: 30 }, (_, round) => round).forEach(() => {
    const days = buildComingDays(
      shuffled(items, random),
      shuffled(versions, random),
      today,
    );
    assert.deepEqual(
      days.map((day) => day.dayKey),
      ['lineA_20261023', 'lineB_20261102', 'lineA_20261106', 'lineA_20261120'],
      'sorted by date then key, whatever order the data arrives in',
    );
    assert.equal(
      days.filter((day) => day.payLineId === 'lineA').length,
      3,
      'a line ending after 3 times has exactly 3 coming days',
    );
    assert.equal(
      days.find((day) => day.payLineId === 'lineB')?.amount.lowCents,
      60_000,
      'a day takes the amount from the version in force on it',
    );
    assert.equal(days[0].sourceName, 'Acme');
  });
  assert.deepEqual(
    buildComingDays(items, versions, utc(2026, 10, 24)).map(
      (day) => day.dayKey,
    ),
    ['lineB_20261102', 'lineA_20261106', 'lineA_20261120'],
    'the count already used by past days still counts',
  );
  assert.deepEqual(buildComingDays([], versions, today), []);
  assert.deepEqual(
    buildComingDays(items, versions.slice(0, 2), today).map(
      (day) => day.dayKey,
    ),
    ['lineA_20261023', 'lineA_20261106', 'lineA_20261120'],
    'a pay line with no version is skipped',
  );
  const monthly = buildComingDays(
    [payLine('m', 1, 'src')],
    [
      payVersion(
        'vm',
        'm',
        1,
        utc(2026, 1, 1),
        { kind: 'monthly', anchor: utc(2026, 1, 31), monthDays: [31] },
        NEVER,
        1,
      ),
    ],
    utc(2027, 1, 1),
  );
  assert.equal(
    monthly.length,
    12,
    'twelve months ahead of January 1 end on December 31',
  );
  assert.equal(
    monthly[1].dayKey,
    'm_20270228',
    'monthly on the 31st lands on February 28',
  );
  assert.deepEqual(
    buildComingDays(
      [payLine('late', 1, 'src')],
      [
        payVersion(
          'vl',
          'late',
          1,
          utc(2030, 1, 1),
          { kind: 'once', anchor: utc(2030, 1, 1), monthDays: [] },
          NEVER,
          1,
        ),
      ],
      today,
    ),
    [],
    'nothing past the lookahead is listed',
  );
}

// Funding cadences.
{
  const everyOther = (anchor: number): Schedule => ({
    kind: 'everyOtherWeek',
    anchor,
    monthDays: [],
  });
  const today = utc(2026, 10, 1);
  const pay = (id: string, schedule: Schedule): OpenVersion => ({
    id: `v_${id}`,
    itemId: id,
    kind: 'payLine',
    createdAt: 1,
    effectiveFrom: utc(2026, 1, 1),
    effectiveUntil: null,
    changeId: 'c',
    payload: {
      name: id,
      schedule,
      amount: { lowCents: 1, highCents: 1 },
      ending: { onDate: null, afterCount: 4 },
    },
  });
  const header = (id: string): PlanItemDoc => ({
    id,
    kind: 'payLine',
    parentId: null,
    createdAt: 1,
    endedAt: null,
    archivedAt: null,
  });
  // Two pay lines, each every other week, a week apart: A on Oct 2, 16, 30 ...; B on Oct 9, 23, Nov 6 ...
  const days = buildComingDays(
    [header('A'), header('B')],
    [
      pay('A', everyOther(utc(2026, 10, 2))),
      pay('B', everyOther(utc(2026, 10, 9))),
    ],
    today,
  );
  const labels = days.map((day) => day.dayKey);
  assert.equal(days.length, 8, 'two lines of four payments interleave');
  assert.deepEqual(
    days.map((day) => day.payLineId),
    ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'],
    'the plan-wide list alternates between the lines',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'everyNth', n: 2, anchorDayKey: labels[0] },
      days,
    ).map((day) => day.dayKey),
    [0, 2, 4, 6].map((index) => labels[index]),
    'every other income day is the alternate days of the combined list',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'everyNth', n: 2, anchorDayKey: labels[1] },
      days,
    ).map((day) => day.dayKey),
    [1, 3, 5, 7].map((index) => labels[index]),
    'the anchor sets which alternate days',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'everyNth', n: 3, anchorDayKey: labels[1] },
      days,
    ).map((day) => day.dayKey),
    [1, 4, 7].map((index) => labels[index]),
    'every third counts from the anchor',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'everyNth', n: 2, anchorDayKey: 'gone' },
      days,
    ).map((day) => day.dayKey),
    [0, 2, 4, 6].map((index) => labels[index]),
    'an anchor no longer listed counts from the first day',
  );
  assert.deepEqual(
    selectFundedDays({ kind: 'everyIncomeDay' }, days).map((day) => day.dayKey),
    labels,
    'every income day selects them all',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'chosen', dayKeys: [labels[5], labels[2], 'gone'] },
      days,
    ).map((day) => day.dayKey),
    [labels[2], labels[5]],
    'chosen days come back in plan order and ignore days not listed',
  );
  assert.deepEqual(
    selectFundedDays(
      { kind: 'everyNth', n: 2, anchorDayKey: labels[0] },
      [...days].reverse(),
    ).map((day) => day.dayKey),
    [0, 2, 4, 6].map((index) => labels[index]),
    'input order does not change which days are selected',
  );
  assert.deepEqual(
    selectFundedDays({ kind: 'chosen', dayKeys: [] }, days),
    [],
    'no chosen days fund nothing',
  );
  assert.deepEqual(
    selectFundedDays({ kind: 'everyNth', n: 2, anchorDayKey: 'x' }, []),
    [],
    'no income days, no funded days',
  );
}

// Draft: the day's money walked through the envelopes in priority order.
{
  const PRIORITY_NAMES = ['must', 'should', 'want'] as const;
  const makeDays = (count: number, cents: number) =>
    Array.from({ length: count }, (_, index) => {
      const on = utc(2026, 11, 6) + index * 14 * DAY_MS;
      return {
        dayKey: toDayKey('line-a', on),
        sourceId: index % 2 === 0 ? 'src-a' : 'src-b',
        on,
        amount: { lowCents: cents, highCents: cents },
      };
    });
  const makeEnvelope = (
    id: string,
    priority: (typeof PRIORITY_NAMES)[number],
    orderIndex: number,
    cents: number,
    createdAt = 1_000,
    cadence: DraftInput['plan']['envelopes'][number]['funding']['cadence'] = {
      kind: 'everyIncomeDay',
    },
  ) => ({
    itemId: id,
    createdAt,
    priority,
    orderIndex,
    funding: { amount: { kind: 'exact' as const, cents }, cadence },
  });
  const draftOf = (
    envelopes: DraftInput['plan']['envelopes'],
    days = makeDays(1, 100_000),
    overrides: DraftInput['overrides'] = { dayCents: {} },
    incomeDays = makeDays(8, 100_000),
  ) =>
    buildDraft({
      days,
      plan: { envelopes, bills: [], goals: [], horizon: 0, incomeDays },
      stance: 'conservative',
      overrides,
    });

  const random = makeRandom(7);
  const randomEnvelopes = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      makeEnvelope(
        `env-${String(index).padStart(3, '0')}`,
        PRIORITY_NAMES[Math.floor(random() * 3)],
        Math.floor(random() * 4),
        Math.floor(random() * 30_000) + 1,
        1_000 + Math.floor(random() * 3),
        random() < 0.5
          ? { kind: 'everyIncomeDay' }
          : { kind: 'everyNth', n: random() < 0.5 ? 2 : 3, anchorDayKey: 'x' },
      ),
    );

  // Must is funded before Should before Want, and what ran short is named.
  const tight = draftOf(
    [
      makeEnvelope('want', 'want', 1, 20_000),
      makeEnvelope('should', 'should', 1, 20_000),
      makeEnvelope('must', 'must', 1, 50_000),
    ],
    makeDays(1, 60_000),
  );
  assert.deepEqual(
    tight.lines.map((line) => [line.itemId, line.cents, line.shortBy]),
    [
      ['must', 50_000, 0],
      ['should', 10_000, 10_000],
      ['want', 0, 20_000],
    ],
    'Must before Should before Want, with the shortfall named',
  );
  assert.deepEqual(
    tight.lines.map((line) => line.reason.code),
    ['funded', 'poolExhausted', 'poolExhausted'],
  );
  assert.equal(tight.freeToSpend.cents, 0);
  assert.equal(
    tight.lines[0].lineId,
    `${tight.days[0].dayKey}:must`,
    'a line id is the day key and the item id',
  );
  assert.deepEqual(tight.lines[0].paidBy, [
    { dayKey: tight.days[0].dayKey, sourceId: 'src-a', cents: 50_000 },
  ]);

  // Free to spend is what is left, by source; a typed amount replaces the plan's.
  const roomy = draftOf([makeEnvelope('a', 'must', 1, 30_000)]);
  assert.equal(roomy.freeToSpend.cents, 70_000);
  assert.deepEqual(roomy.freeToSpend.bySource, [
    { sourceId: 'src-a', cents: 70_000 },
  ]);
  const typed = draftOf([makeEnvelope('a', 'must', 1, 30_000)], undefined, {
    dayCents: { [roomy.days[0].dayKey]: 10_000 },
  });
  assert.equal(typed.moneyCents, 10_000, 'a typed day amount is used');
  assert.equal(typed.lines[0].cents, 10_000);
  assert.equal(typed.lines[0].shortBy, 20_000);
  assert.equal(
    draftOf([], undefined, { dayCents: { [roomy.days[0].dayKey]: -5 } })
      .moneyCents,
    0,
    'day money is never negative',
  );
  assert.deepEqual(draftOf([]).lines, [], 'no envelopes, no lines');

  // Two demands equal on tier, order and date added: the same one first every run, and it says so.
  const tie = [
    makeEnvelope('zeta', 'should', 1, 60_000),
    makeEnvelope('alpha', 'should', 1, 60_000),
  ];
  const tieRuns = [tie, [...tie].reverse()].map((order) =>
    draftOf(order, makeDays(1, 80_000)),
  );
  assert.equal(JSON.stringify(tieRuns[0]), JSON.stringify(tieRuns[1]));
  assert.deepEqual(
    tieRuns[0].lines.map((line) => [line.itemId, line.cents, line.tieBrokenBy]),
    [
      ['alpha', 60_000, 'itemId'],
      ['zeta', 20_000, null],
    ],
    'an exact tie goes to the lower id and the first line says so',
  );
  const earlier = draftOf(
    [
      makeEnvelope('b', 'should', 1, 60_000, 2_000),
      makeEnvelope('a', 'should', 1, 60_000, 3_000),
    ],
    makeDays(1, 80_000),
  );
  assert.deepEqual(
    earlier.lines.map((line) => [line.itemId, line.tieBrokenBy]),
    [
      ['b', 'createdAt'],
      ['a', null],
    ],
    'the envelope added first goes first and names the date added',
  );
  assert.equal(
    draftOf(tie, makeDays(1, 200_000)).lines.every(
      (line) => line.tieBrokenBy === null,
    ),
    true,
    'no tie is claimed when the money covers both',
  );

  // Cadences pick days from the plan-wide list.
  const eight = makeDays(8, 100_000);
  const everyOther = (anchor: number) =>
    makeEnvelope('n', 'must', 1, 1_000, 1_000, {
      kind: 'everyNth',
      n: 2,
      anchorDayKey: eight[anchor].dayKey,
    });
  assert.deepEqual(
    eight.map((day) => buildDemands([day], eight, [everyOther(0)]).length),
    [1, 0, 1, 0, 1, 0, 1, 0],
    'every other day funds the anchor and every second day after it',
  );

  // Properties over random plans.
  const planned = makeDays(3, 90_000);
  Array.from({ length: 40 }, (_, round) => {
    const envelopes = randomEnvelopes(5 + (round % 20));
    const days = round % 2 === 0 ? planned.slice(0, 1) : planned;
    const baseline = draftOf(envelopes, days, { dayCents: {} }, planned);
    const json = JSON.stringify(baseline);

    assert.equal(
      JSON.stringify(draftOf(envelopes, days, { dayCents: {} }, planned)),
      json,
      'the same inputs give identical JSON',
    );
    assert.equal(
      JSON.stringify(
        draftOf(
          shuffled(envelopes, random),
          shuffled(days, random),
          { dayCents: {} },
          shuffled(planned, random),
        ),
      ),
      json,
      'shuffling the inputs changes nothing',
    );
    assert.equal(
      baseline.lines.reduce((sum, line) => sum + line.cents, 0) +
        baseline.freeToSpend.cents,
      baseline.moneyCents,
      'line cents plus Free to spend equal the day money',
    );
    assert.equal(
      baseline.freeToSpend.cents,
      baseline.freeToSpend.bySource.reduce(
        (sum, entry) => sum + entry.cents,
        0,
      ),
    );
    baseline.lines.forEach((line) => {
      assert.ok(line.cents >= 0 && line.shortBy >= 0, 'no line is negative');
      assert.equal(line.cents + line.shortBy, line.demandCents);
      assert.equal(
        line.paidBy.reduce((sum, part) => sum + part.cents, 0),
        line.cents,
        'paidBy adds up to the line',
      );
    });

    // Dropping a lower-priority demand never reduces a higher one.
    baseline.lines.forEach((dropped, droppedIndex) => {
      const without = draftOf(
        envelopes.filter((envelope) => envelope.itemId !== dropped.itemId),
        days,
        { dayCents: {} },
        planned,
      );
      const after = new Map(
        without.lines.map((line) => [line.lineId, line.cents]),
      );
      baseline.lines.slice(0, droppedIndex).forEach((higher) => {
        if (higher.itemId === dropped.itemId) return;
        assert.ok(
          (after.get(higher.lineId) ?? 0) >= higher.cents,
          'dropping a later demand does not reduce an earlier line',
        );
      });
    });

    // A priority never loses money to a lower one while it is short.
    const firstShort = baseline.lines.findIndex((line) => line.shortBy > 0);
    if (firstShort >= 0) {
      baseline.lines.slice(firstShort + 1).forEach((line) => {
        assert.equal(
          line.cents,
          0,
          'nothing is funded after the money runs out',
        );
      });
      assert.equal(baseline.freeToSpend.cents, 0);
    }
  });

  // 50 envelopes over a year of income days recompute well inside the budget.
  const yearDays = makeDays(26, 250_000);
  const fifty = randomEnvelopes(50);
  const timings = Array.from({ length: 30 }, () => {
    const started = performance.now();
    draftOf(fifty, yearDays.slice(0, 1), { dayCents: {} }, yearDays);
    return performance.now() - started;
  }).sort((a, b) => a - b);
  assert.ok(timings[15] < 30, `50-envelope draft median ${timings[15]}ms`);
  console.log(
    `runway engine: 50-envelope draft median ${timings[15].toFixed(2)} ms, worst ${timings[29].toFixed(2)} ms`,
  );
}

// Bills: suggested spreads a payment over the income days before it is due, chosen days split it.
{
  const day = (stamp: number, key = String(stamp)) => ({
    dayKey: `pay_${key}`,
    sourceId: 'src',
    on: stamp,
    amount: { lowCents: 500_000, highCents: 500_000 },
  });
  const makeBill = (
    over: Partial<DraftBillInput> & Pick<DraftBillInput, 'schedule'>,
  ): DraftBillInput => ({
    itemId: 'rent',
    createdAt: 1,
    priority: 'must',
    orderIndex: 1,
    amountCents: 150_000,
    ending: NEVER,
    fundedBy: { kind: 'suggested' },
    ...over,
  });
  const once = (on: number): Schedule => ({
    kind: 'once',
    anchor: on,
    monthDays: [],
  });
  const monthly = (on: number): Schedule => ({
    kind: 'monthly',
    anchor: on,
    monthDays: [new Date(on).getUTCDate()],
  });
  const horizon = utc(2027, 10, 1);
  const demandsOf = (
    bills: DraftBillInput[],
    incomeDays: ReturnType<typeof day>[],
    planned = incomeDays,
  ) =>
    buildDemands(planned, incomeDays, [], bills, horizon)
      .sort(
        (a, b) =>
          a.dayKey.localeCompare(b.dayKey) ||
          a.itemId.localeCompare(b.itemId) ||
          (a.bill?.dueOn ?? 0) - (b.bill?.dueOn ?? 0),
      )
      .map((d) => [d.dayKey, d.cents, d.dueBeforeNext, d.bill?.dueOn]);

  // Rent due the 1st with income on the 24th, 31st and 7th.
  const incomes = [
    day(utc(2026, 11, 24), 'a'),
    day(utc(2026, 12, 31), 'b'),
    day(utc(2027, 1, 7), 'c'),
  ];
  const rent = makeBill({
    amountCents: 150_001,
    schedule: once(utc(2027, 1, 1)),
  });
  assert.deepEqual(
    demandsOf([rent], incomes),
    [
      ['pay_a', 75_001, false, utc(2027, 1, 1)],
      ['pay_b', 75_000, true, utc(2027, 1, 1)],
    ],
    'rent funds across the first two income days and the third is not needed',
  );

  // A payment due before the next income day demands all of it on the day before.
  assert.deepEqual(
    demandsOf(
      [makeBill({ schedule: once(utc(2026, 12, 1)) })],
      [day(utc(2026, 11, 24), 'a'), day(utc(2026, 12, 7), 'c')],
    ),
    [['pay_a', 150_000, true, utc(2026, 12, 1)]],
    'one income day before the due date takes it all',
  );
  assert.deepEqual(
    demandsOf([makeBill({ schedule: once(utc(2026, 11, 1)) })], incomes),
    [],
    'a bill due before any income day asks nothing',
  );
  assert.deepEqual(
    demandsOf([makeBill({ schedule: once(utc(2026, 11, 24)) })], incomes),
    [['pay_a', 150_000, true, utc(2026, 11, 24)]],
    'income on the due date itself counts',
  );

  // A monthly bill: each payment is funded by the days after the one before it.
  const biweekly = Array.from({ length: 8 }, (_, index) =>
    day(utc(2026, 11, 6) + index * 14 * DAY_MS, String(index)),
  );
  const monthlyRent = makeBill({
    amountCents: 100_000,
    schedule: monthly(utc(2026, 12, 1)),
  });
  const payments = planBillPayments(monthlyRent, biweekly, horizon);
  assert.deepEqual(
    payments.slice(0, 3).map((p) => [toDayStamp(p.dueOn), p.parts.length]),
    [
      ['20261201', 2],
      ['20270101', 3],
      ['20270201', 2],
    ],
    'monthly payments take the income days between their dues',
  );
  assert.ok(
    payments.every(
      (payment) =>
        payment.parts.reduce((sum, part) => sum + part.cents, 0) ===
          payment.totalCents || payment.parts.length === 0,
    ),
    'every payment is set aside in full',
  );
  const ordered = demandsOf([monthlyRent], biweekly);
  assert.equal(
    new Set(ordered.map((entry) => entry[0])).size,
    ordered.length,
    'a day never asks twice for one bill',
  );

  // Shares re-divide what is left, so they never pass the bill and always sum to it.
  const uneven = planBillPayments(
    makeBill({ amountCents: 10, schedule: once(utc(2027, 1, 1)) }),
    [...incomes, day(utc(2026, 12, 15), 'd')],
    horizon,
  );
  assert.deepEqual(
    uneven[0].parts.map((part) => part.cents),
    [4, 3, 3],
    'ceil of what is left over the days left, summing to the bill',
  );

  // A monthly bill on the 31st lands on the last day of shorter months.
  assert.deepEqual(
    planBillPayments(
      makeBill({ schedule: monthly(utc(2026, 12, 31)) }),
      biweekly,
      horizon,
    )
      .slice(0, 3)
      .map((payment) => toDayStamp(payment.dueOn)),
    ['20261231', '20270131', '20270228'],
    'day 31 clamps to the month length',
  );

  // Endings reuse the schedule machinery.
  const sixTimes = makeBill({
    schedule: monthly(utc(2026, 12, 1)),
    ending: { onDate: null, afterCount: 6 },
  });
  assert.equal(
    planBillPayments(sixTimes, biweekly, horizon).length,
    6,
    'a bill ending after 6 payments has 6',
  );
  assert.equal(
    planBillPayments(
      makeBill({
        schedule: monthly(utc(2026, 12, 1)),
        ending: { onDate: utc(2027, 2, 1), afterCount: null },
      }),
      biweekly,
      horizon,
    ).length,
    3,
    'an end date covers its whole day',
  );

  // Chosen days split the amount with allocate, ignoring days that have passed.
  const chosen = makeBill({
    amountCents: 100,
    schedule: once(utc(2027, 1, 1)),
    fundedBy: { kind: 'chosen', dayKeys: ['pay_c', 'pay_a', 'pay_b', 'gone'] },
  });
  assert.deepEqual(
    demandsOf([chosen], [...incomes].reverse()).map((entry) => entry[1]),
    [34, 33, 33],
    'three chosen days split with the extra cent first',
  );
  assert.deepEqual(
    demandsOf(
      [{ ...chosen, fundedBy: { kind: 'chosen', dayKeys: [] } }],
      incomes,
    ),
    [],
    'no chosen days fund nothing',
  );

  // A bill competes with envelopes by priority and urgency in the draft.
  const draft = buildDraft({
    days: [incomes[1]],
    plan: {
      envelopes: [
        {
          itemId: 'dining',
          createdAt: 1,
          priority: 'want',
          orderIndex: 1,
          funding: {
            amount: { kind: 'exact', cents: 500_000 },
            cadence: { kind: 'everyIncomeDay' },
          },
        },
      ],
      bills: [rent],
      goals: [],
      horizon,
      incomeDays: incomes,
    },
    stance: 'conservative',
    overrides: { dayCents: {} },
  });
  assert.deepEqual(
    draft.lines.map((line) => [line.itemId, line.cents, line.shortBy]),
    [
      ['rent', 75_000, 0],
      ['dining', 425_000, 75_000],
    ],
    'a Must bill is set aside before a Want envelope',
  );
  assert.equal(draft.lines[0].bill?.totalCents, 150_001);
  assert.equal(draft.freeToSpend.cents, 0);

  // The same bills give the same demands whatever order they arrive in.
  const random = makeRandom(5);
  const bills = [
    rent,
    { ...chosen, itemId: 'chosen' },
    { ...monthlyRent, itemId: 'monthly' },
    makeBill({ itemId: 'a', schedule: once(utc(2027, 3, 1)) }),
    makeBill({ itemId: 'b', schedule: monthly(utc(2026, 12, 15)) }),
  ];
  const expected = JSON.stringify(demandsOf(bills, biweekly));
  Array.from({ length: 20 }).forEach(() => {
    assert.equal(
      JSON.stringify(
        demandsOf(shuffled(bills, random), shuffled(biweekly, random)),
      ),
      expected,
      'bill demands do not depend on input order',
    );
  });
}

// Goals: the seeded three, worked by hand against the seed's income days.
{
  const today = utc(2026, 11, 1);
  const offsets = [3, 6, 17, 20, 31, 45, 59, 73];
  const incomes = offsets.map((offset) => {
    const on = today + offset * DAY_MS;
    return { dayKey: toDayKey(`line-${offset}`, on), on };
  });
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });
  const vacation = {
    targetCents: 180_000,
    targetDate: today + 50 * DAY_MS,
    heldCents: 0,
    funding: {
      amount: exact(30_000),
      cadence: { kind: 'everyIncomeDay' as const },
    },
  };
  const cushion = {
    targetCents: 60_000,
    targetDate: null,
    heldCents: 0,
    funding: {
      amount: exact(15_000),
      cadence: {
        kind: 'everyNth' as const,
        n: 2 as const,
        anchorDayKey: incomes[0].dayKey,
      },
    },
  };
  const phone = {
    targetCents: 20_000,
    targetDate: today + 30 * DAY_MS,
    heldCents: 0,
    funding: {
      amount: exact(20_000),
      cadence: { kind: 'everyIncomeDay' as const },
    },
  };
  const dayOf = (offset: number) => incomes[offsets.indexOf(offset)];

  // Vacation fund: income days through +50 are +3, +6, +17, +20, +31 and +45, six of them, so
  // $1,800 / 6 = $300 each; six funded days at $300 reach $1,800 on the last, exactly on pace.
  assert.deepEqual(
    getPace(vacation, incomes),
    {
      isComplete: false,
      remainingCents: 180_000,
      dayCount: 6,
      neededPerDayCents: 30_000,
      plannedByDateCents: 180_000,
      reachedOn: dayOf(45),
      state: 'onPace',
    },
    'vacation fund: $300 each of six income days, on pace',
  );

  // Emergency cushion, no date: every other income day is +3, +17, +31 and +59; four times $150
  // is $600, reached on +59.
  assert.deepEqual(
    getPace(cushion, incomes),
    {
      isComplete: false,
      remainingCents: 60_000,
      dayCount: 0,
      neededPerDayCents: null,
      plannedByDateCents: 0,
      reachedOn: dayOf(59),
      state: null,
    },
    'cushion: no date, reached on the fourth funded day',
  );

  // New phone: income days through +30 are +3, +6, +17 and +20, so $200 / 4 = $50; the first
  // $200 contribution reaches it and three funded days are to spare.
  assert.deepEqual(
    getPace(phone, incomes),
    {
      isComplete: false,
      remainingCents: 20_000,
      dayCount: 4,
      neededPerDayCents: 5_000,
      plannedByDateCents: 20_000,
      reachedOn: dayOf(3),
      state: 'ahead',
    },
    'phone: $50 each of four income days, ahead',
  );

  // Behind: $250 each of seven income days through +59 is $1,750, short of $1,800; it needs $257.15.
  const behind = getPace(
    {
      ...vacation,
      targetDate: today + 59 * DAY_MS,
      funding: { amount: exact(25_000), cadence: { kind: 'everyIncomeDay' } },
    },
    incomes,
  );
  assert.equal(behind.state, 'behind');
  assert.equal(behind.neededPerDayCents, 25_715);
  assert.equal(behind.plannedByDateCents, 175_000);
  assert.equal(behind.reachedOn?.on, dayOf(73).on, 'reached after the date');

  // A goal at its target is complete and funds nothing.
  const complete = getPace({ ...phone, heldCents: 20_000 }, incomes);
  assert.equal(complete.isComplete, true);
  assert.equal(complete.state, null);
  assert.deepEqual(
    planGoalContributions({ ...phone, heldCents: 20_000 }, incomes),
    [],
  );
  assert.deepEqual(
    planGoalContributions({ ...phone, heldCents: 15_000 }, incomes).map(
      (part) => part.cents,
    ),
    [5_000],
    'the last contribution is cut to what is left',
  );

  // The draft stops drawing money once the target is reached.
  const goalInput = (
    itemId: string,
    goal: typeof vacation | typeof phone,
  ): DraftGoalInput => ({
    itemId,
    createdAt: 1_000,
    priority: 'want',
    orderIndex: 1,
    funding: goal.funding,
    targetCents: goal.targetCents,
    heldCents: 0,
  });
  const goals = [goalInput('vacation', vacation), goalInput('phone', phone)];
  const draftAt = (offset: number) =>
    buildDraft({
      days: [
        {
          ...dayOf(offset),
          sourceId: null,
          amount: { lowCents: 214_000, highCents: 214_000 },
        },
      ],
      plan: {
        envelopes: [],
        bills: [],
        goals,
        horizon: 0,
        incomeDays: incomes,
      },
      stance: 'conservative',
      overrides: { dayCents: {} },
    }).lines.map((line) => [line.itemId, line.cents]);
  assert.deepEqual(draftAt(3), [
    ['phone', 20_000],
    ['vacation', 30_000],
  ]);
  assert.deepEqual(
    draftAt(6),
    [['vacation', 30_000]],
    'the phone goal is full after the first day',
  );
  assert.deepEqual(
    draftAt(45),
    [['vacation', 30_000]],
    'the sixth day still funds the vacation goal',
  );
  assert.deepEqual(
    draftAt(59),
    [],
    'the vacation goal is full after the sixth day',
  );

  // Input order changes nothing.
  const random = makeRandom(9);
  Array.from({ length: 20 }).forEach(() => {
    assert.deepEqual(
      getPace(vacation, shuffled(incomes, random)),
      getPace(vacation, incomes),
      'pace does not depend on income day order',
    );
    assert.deepEqual(
      planGoalContributions(cushion, shuffled(incomes, random)).map(
        (part) => part.cents,
      ),
      [15_000, 15_000, 15_000, 15_000],
    );
  });
}

// Percentages and the rest (Issue 10).
{
  assert.equal(percentOf(1_999, 1_000), 199, 'percentOf rounds down once');
  assert.deepEqual(
    percentShares(10_001, [3_333, 3_333, 3_333], ['c', 'a', 'b']),
    [3_333, 3_333, 3_333],
    'three 33.33% lines of $100.01 add to the one rounded total',
  );
  assert.deepEqual(
    percentShares(101, [5_000, 5_000], ['b', 'a']),
    [50, 51],
    'two halves of $1.01 share $1.01, the odd cent going to the first id',
  );
  assert.deepEqual(
    percentShares(1_000, [10_000, 1_000], ['a', 'b']),
    [1_000, 100],
    'over 100% in all, each rounds on its own and the walk cuts the later line',
  );

  const on = utc(2026, 11, 6);
  const day = {
    dayKey: toDayKey('line-p', on),
    sourceId: 'src-a',
    on,
    amount: { lowCents: 100_001, highCents: 100_001 },
  };
  const incomeDays = [
    { dayKey: day.dayKey, on, moneyCents: 100_001 },
    ...[1, 2, 3].map((n) => ({
      dayKey: toDayKey('line-p', on + n * 14 * DAY_MS),
      on: on + n * 14 * DAY_MS,
      moneyCents: 100_001,
    })),
  ];
  const line = (
    itemId: string,
    priority: 'must' | 'should' | 'want',
    orderIndex: number,
    amount: DraftInput['plan']['envelopes'][number]['funding']['amount'],
  ) => ({
    itemId,
    createdAt: 1_000,
    priority,
    orderIndex,
    funding: { amount, cadence: { kind: 'everyIncomeDay' as const } },
  });
  const percent = (bps: number) =>
    ({ kind: 'percent', bps, of: 'dayMoney' }) as const;
  const draftOf = (
    envelopes: DraftInput['plan']['envelopes'],
    dayCents = 100_001,
    goals: DraftGoalInput[] = [],
  ) =>
    buildDraft({
      days: [day],
      plan: { envelopes, bills: [], goals, horizon: 0, incomeDays },
      stance: 'conservative',
      overrides: { dayCents: { [day.dayKey]: dayCents } },
    });
  const spent = (draft: ReturnType<typeof draftOf>) =>
    draft.lines.reduce((sum, item) => sum + item.cents, 0);

  // A 100% line plus any other line never funds more than the day's money.
  [1, 500, 2_500, 10_000].forEach((bps) => {
    const draft = draftOf([
      line('whole', 'must', 1, percent(10_000)),
      line('other', 'should', 1, percent(bps)),
      line('plain', 'want', 1, { kind: 'exact', cents: 500_000 }),
    ]);
    assert.ok(spent(draft) <= 100_001, `100% plus ${bps} bps stays in the day`);
    assert.equal(
      spent(draft) + draft.freeToSpend.cents,
      100_001,
      'lines plus free to spend equal the day money',
    );
  });
  assert.deepEqual(
    draftOf([
      line('whole', 'must', 1, percent(10_000)),
      line('other', 'should', 1, percent(1_000)),
    ]).lines.map((item) => [item.itemId, item.cents]),
    [
      ['whole', 100_001],
      ['other', 0],
    ],
    'a 100% line takes the whole day; the later line is left short',
  );

  // Percent lines on one day share one rounded total; the odd cent goes to the first id.
  const halves = draftOf([
    line('b', 'should', 1, percent(5_000)),
    line('a', 'should', 2, percent(5_000)),
  ]);
  assert.deepEqual(
    halves.lines.map((item) => [item.itemId, item.cents]).sort(),
    [
      ['a', 50_001],
      ['b', 50_000],
    ],
    'two halves of $1,000.01 add to $1,000.01, the odd cent to the first id',
  );
  assert.equal(
    halves.lines.find((item) => item.itemId === 'a')?.ask.kind,
    'percent',
  );

  // Rest takes what its day then holds, last in its tier, and a second rest follows the normal order.
  const rest = { kind: 'rest' } as const;
  const withRest = draftOf([
    line('rest', 'should', 1, rest),
    line('ten', 'should', 2, percent(1_000)),
    line('rent', 'must', 1, { kind: 'exact', cents: 30_000 }),
    line('fun', 'want', 1, { kind: 'exact', cents: 5_000 }),
  ]);
  assert.deepEqual(
    withRest.lines.map((item) => [item.itemId, item.cents]),
    [
      ['rent', 30_000],
      ['ten', 10_000],
      ['rest', 60_001],
      ['fun', 0],
    ],
    'rest sorts last in its tier, takes the pool then and leaves the lower tier nothing',
  );
  assert.equal(withRest.freeToSpend.cents, 0);
  const twoRests = draftOf([
    line('r2', 'should', 2, rest),
    line('r1', 'should', 1, rest),
  ]);
  assert.deepEqual(
    twoRests.lines.map((item) => [item.itemId, item.cents, item.reason.code]),
    [
      ['r1', 100_001, 'funded'],
      ['r2', 0, 'nothingLeft'],
    ],
    'two rest demands in a tier follow the normal order; the second finds nothing',
  );
  const empty = draftOf([
    line('rent', 'must', 1, { kind: 'exact', cents: 100_001 }),
    line('rest', 'want', 1, rest),
  ]);
  assert.deepEqual(
    empty.lines.map((item) => [
      item.itemId,
      item.cents,
      item.shortBy,
      item.reason.code,
    ]),
    [
      ['rent', 100_001, 0, 'funded'],
      ['rest', 0, 0, 'nothingLeft'],
    ],
    'rest on a day with nothing left shows $0 funded and says why',
  );

  // A rest line takes only its own day's money in a draft of several days.
  const nextOn = on + 14 * DAY_MS;
  const second = {
    dayKey: toDayKey('line-p', nextOn),
    sourceId: 'src-b',
    on: nextOn,
    amount: { lowCents: 40_000, highCents: 40_000 },
  };
  const together = buildDraft({
    days: [day, second],
    plan: {
      envelopes: [
        line('rent', 'must', 1, { kind: 'exact', cents: 20_000 }),
        line('rest', 'want', 1, rest),
      ],
      bills: [],
      goals: [],
      horizon: 0,
      incomeDays,
    },
    stance: 'conservative',
    overrides: { dayCents: {} },
  });
  assert.deepEqual(
    together.lines
      .filter((item) => item.itemId === 'rest')
      .map((item) => [item.dayKey === day.dayKey, item.cents]),
    [
      [true, 60_001],
      [false, 40_000],
    ],
    'each day funds its rest from what is left of its own money, after the earlier lines drew from the front of the pool',
  );

  // A goal at a percentage stops at its target; a rest goal is capped by it.
  const goal = (amount: ReturnType<typeof percent> | typeof rest) => ({
    ...line('goal', 'should', 1, amount),
    targetCents: 150_000,
    heldCents: 0,
  });
  assert.deepEqual(
    planGoalContributions(goal(percent(5_000)), incomeDays).map(
      (part) => part.cents,
    ),
    [50_000, 50_000, 50_000],
    '50% of $1,000.01 each day, three days reach $1,500',
  );
  assert.equal(
    getPace({ ...goal(rest), targetDate: null }, incomeDays).state,
    null,
    'a rest goal has no pace to measure',
  );
  assert.deepEqual(
    draftOf([], 100_001, [goal(rest)]).lines.map((item) => item.cents),
    [100_001],
    'a rest goal takes the day when the target is far',
  );
  assert.deepEqual(
    draftOf([], 100_001, [{ ...goal(rest), targetCents: 30_000 }]).lines.map(
      (item) => item.cents,
    ),
    [30_000],
    'a rest goal never takes more than the target left',
  );

  // Words and legacy shapes.
  assert.equal(describeAmount(percent(1_250), 'Main job'), '12.5% of Main job');
  assert.equal(describeAmount(percent(1_000)), "10% of the day's money");
  assert.equal(describeAmount(rest), 'the rest');
  assert.deepEqual(
    normalizeFunding({
      amount: { cents: 1_500 },
      cadence: { kind: 'everyIncomeDay' },
    } as never).amount,
    { kind: 'exact', cents: 1_500 },
    'a funding amount written before it had a kind reads as exact',
  );
  assert.deepEqual(
    ['10', '12.5', '12.50', '0', '100', '100.5', '12.3', 'x', ''].map(
      parsePercentToBps,
    ),
    [1_000, 1_250, 1_250, null, 10_000, null, null, null, null],
    'whole and half percents only, above zero up to 100',
  );

  // Order of the input changes nothing.
  const mixed = [
    line('a', 'should', 1, percent(2_500)),
    line('b', 'should', 2, percent(2_500)),
    line('c', 'should', 3, rest),
    line('d', 'must', 1, { kind: 'exact', cents: 12_345 }),
  ];
  assert.deepEqual(
    draftOf([...mixed].reverse()),
    draftOf(mixed),
    'shuffled envelopes give the same draft',
  );
}

console.log('runway engine: ok');
