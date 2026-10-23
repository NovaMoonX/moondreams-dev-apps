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
import { allocate, percentOf } from '../../src/apps/runway/engine/money.ts';
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

console.log('runway engine: ok');
