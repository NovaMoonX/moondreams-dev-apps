// Pure checks for Runway's engine; run under several time zones: `TZ=America/Los_Angeles npm run check:runway-engine`.
import assert from 'node:assert/strict';

import {
  createSealedReader,
  sealJson,
} from '../../src/apps/runway/security.ts';
import {
  getEarliestTrackingStart,
  getLevel,
  startTrackingPeriod,
  stopTrackingPeriod,
} from '../../src/apps/runway/engine/level.ts';
import {
  deriveBalances,
  deriveBalancesBefore,
} from '../../src/apps/runway/engine/balances.ts';
import { checkAmount } from '../../src/apps/runway/engine/checkAmount.ts';
import {
  describePurchaseEdit,
  describePurchaseRemoval,
} from '../../src/apps/runway/utils/purchaseText.ts';
import { describeAmountCheck } from '../../src/apps/runway/utils/checkText.ts';
import {
  getLineEffect,
  getPurchaseEffect,
  getCountedFrom,
  getRefundableCents,
  getRefundLines,
  isInTrackingPeriods,
  splitEvenly,
  sumLines,
  toChosenLines,
} from '../../src/apps/runway/engine/purchases.ts';
import type {
  OpenMove,
  OpenPurchase,
  OpenRecord,
} from '../../src/apps/runway/types.ts';
import { describeEnvelopeFigure } from '../../src/apps/runway/utils/purchaseText.ts';
import { getLevelWords } from '../../src/apps/runway/utils/levelText.ts';
import { layerVersion } from '../../src/apps/runway/engine/whatIf.ts';
import { previewChange } from '../../src/apps/runway/store/selectors/previewSelectors.ts';
import {
  computeDraftView,
  selectReachedEndingsKey,
} from '../../src/apps/runway/store/selectors/runwaySelectors.ts';
import {
  describeChange,
  isSamePayload,
  type ItemPayload,
} from '../../src/apps/runway/utils/changeText.ts';
import {
  getChangeSpan,
  INITIAL_FROM_WHEN,
} from '../../src/apps/runway/utils/fromWhen.ts';
import { describeLineReason } from '../../src/apps/runway/utils/draftText.ts';
import {
  capEnding,
  findReachedEnding,
} from '../../src/apps/runway/engine/endings.ts';
import {
  findReturning,
  getStretchEnd,
} from '../../src/apps/runway/engine/stretch.ts';

import {
  buildComingDays,
  describeDay,
} from '../../src/apps/runway/engine/comingDays.ts';
import {
  buildCorrection,
  getCorrectionId,
  getEffectiveSplit,
  getEffectiveSplits,
  getRecordChain,
  keepTicks,
  toSplit,
} from '../../src/apps/runway/engine/correct.ts';
import {
  buildRecords,
  countUnresolvedHolds,
  getFreeAfterArrival,
  sumConfirmedByItem,
} from '../../src/apps/runway/engine/confirm.ts';
import {
  applyLineEdits,
  getLineDifferences,
  getRemainder,
  sumLines,
  suggestShortfall,
} from '../../src/apps/runway/engine/differences.ts';
import { hashOverride } from '../../src/apps/runway/engine/fingerprint.ts';
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
  pickPairings,
  type DraftInput,
} from '../../src/apps/runway/engine/draft.ts';
import {
  deriveBalances,
  getFreeToSpendFigure,
} from '../../src/apps/runway/engine/balances.ts';
import {
  getStanceCushion,
  lookahead,
  type LookaheadDraft,
} from '../../src/apps/runway/engine/lookahead.ts';
import { computeLookahead } from '../../src/apps/runway/store/selectors/lookaheadSelectors.ts';
import {
  collectStarted,
  countFundedDays,
  collectFunded,
  collectPaid,
  countMarks,
  getPaidMoveId,
  getUndoMoveId,
} from '../../src/apps/runway/engine/progress.ts';
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
  resolveNextChange,
  resolveVersion,
} from '../../src/apps/runway/engine/resolve.ts';
import {
  occurrences,
  selectFundedDays,
} from '../../src/apps/runway/engine/schedule.ts';
import {
  effectiveStance,
  pick,
  readStance,
} from '../../src/apps/runway/engine/stance.ts';
import type {
  ConfirmedSealed,
  Ending,
  MoneyRange,
  OpenMove,
  OpenRecord,
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
    amount: { lowCents: 150_000, highCents: 150_000 },
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
    amount: { lowCents: 150_001, highCents: 150_001 },
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
    amount: { lowCents: 100_000, highCents: 100_000 },
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
    makeBill({
      amount: { lowCents: 10, highCents: 10 },
      schedule: once(utc(2027, 1, 1)),
    }),
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
    amount: { lowCents: 100, highCents: 100 },
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

// Pairings: a day's money goes to named targets first; a short one is topped up, held or left short.
{
  const on1 = utc(2026, 11, 6);
  const on2 = on1 + 14 * DAY_MS;
  const mkDay = (
    key: string,
    on: number,
    cents: number,
    pairings: NonNullable<Parameters<typeof pickPairings>[0]['pairings']>,
  ) => ({
    dayKey: key,
    sourceId: 'src',
    on,
    amount: { lowCents: cents, highCents: cents },
    pairings,
  });
  const none = { day: null, payLine: [], source: [] };
  const exact = (cents: number) => ({ kind: 'exact', cents }) as const;
  const env = (
    itemId: string,
    priority: 'must' | 'should' | 'want',
    cents: number,
    orderIndex = 1,
  ) => ({
    itemId,
    createdAt: 1,
    priority,
    orderIndex,
    funding: {
      amount: exact(cents),
      cadence: { kind: 'everyIncomeDay' as const },
    },
  });
  const pair = (
    targetItemId: string,
    cents: number,
    topUpFromAnySource = false,
  ) => ({ targetItemId, amount: exact(cents), topUpFromAnySource });
  const envelopes = [
    env('rent', 'must', 5_000),
    env('taxes', 'must', 45_000, 2),
    env('save', 'should', 30_000),
    env('fun', 'want', 20_000),
  ];
  const incomeDays = [
    { dayKey: 'd1', on: on1, moneyCents: 100_000 },
    { dayKey: 'd2', on: on2, moneyCents: 50_000 },
  ];
  const build = (
    pairings: ReturnType<typeof pair>[],
    holdResolutions: Record<string, 'topUp' | 'leaveShort'> = {},
    list = envelopes,
  ) =>
    buildDraft({
      days: [
        mkDay('d1', on1, 100_000, { ...none, payLine: pairings }),
        mkDay('d2', on2, 50_000, none),
      ],
      plan: {
        envelopes: list,
        bills: [],
        goals: [],
        horizon: 0,
        incomeDays,
      },
      stance: 'conservative',
      overrides: { dayCents: {}, holdResolutions },
    });
  const lineOf = (draft: ReturnType<typeof build>, id: string, day = 'd1') =>
    draft.lines.find((item) => item.lineId === `${day}:${id}`);
  const total = (draft: ReturnType<typeof build>) =>
    draft.lines.reduce((sum, item) => sum + item.cents, 0) +
    draft.heldCents +
    draft.freeToSpend.cents;

  // A pairing the day's own money covers is one line, and replaces the target's own rule.
  const covered = build([pair('rent', 40_000)]);
  assert.equal(lineOf(covered, 'rent')?.cents, 40_000);
  assert.equal(
    covered.lines.filter(
      (item) => item.itemId === 'rent' && item.dayKey === 'd1',
    ).length,
    1,
    'a paired target is never funded twice on its day',
  );
  assert.equal(lineOf(covered, 'rent')?.pairing?.state, 'funded');
  assert.equal(
    lineOf(covered, 'rent', 'd2')?.cents,
    5_000,
    'the other day keeps the target rule',
  );
  assert.equal(covered.lines[0].itemId, 'rent', 'pairings come first');

  // Short by $100 with a top-up allowed: funded at the target tier from the pool.
  const topUp = build([pair('rent', 110_000, true)]);
  const rentTop = lineOf(topUp, 'rent');
  assert.equal(rentTop?.cents, 110_000, 'a topped-up pairing is whole');
  assert.equal(rentTop?.shortBy, 0);
  assert.equal(rentTop?.pairing?.state, 'autoTopUp');
  assert.deepEqual(
    rentTop?.paidBy.map((part) => [part.dayKey, part.cents]),
    [
      ['d1', 100_000],
      ['d2', 10_000],
    ],
    'the top-up names the day whose money paid it',
  );
  assert.equal(
    lineOf(topUp, 'taxes')?.cents,
    35_000,
    'a Must top-up goes before a Should or Want',
  );
  assert.equal(lineOf(topUp, 'save')?.cents, 0);
  assert.equal(total(topUp), 150_000);

  // A Must or Should that cannot be topped up is held: money reserved, not funded.
  const held = build([pair('rent', 110_000)]);
  const rentHeld = lineOf(held, 'rent');
  assert.equal(rentHeld?.pairing?.state, 'held');
  assert.equal(rentHeld?.cents, 100_000);
  assert.equal(rentHeld?.shortBy, 10_000);
  assert.equal(rentHeld?.pairing?.heldCents, 10_000);
  assert.equal(held.heldCents, 10_000);
  assert.equal(
    total(held),
    150_000,
    'lines, held money and free to spend add up',
  );
  assert.equal(
    lineOf(held, 'save', 'd2')?.cents + (lineOf(held, 'fun', 'd2')?.cents ?? 0),
    0,
    'envelopes below the hold on its pool get only what the hold left',
  );
  const leftShort = build([pair('rent', 110_000)], { 'd1:rent': 'leaveShort' });
  assert.equal(leftShort.heldCents, 0, 'leaving it short releases the money');
  assert.equal(lineOf(leftShort, 'rent')?.pairing?.state, 'leftShort');
  assert.equal(lineOf(leftShort, 'rent')?.shortBy, 10_000);
  assert.ok(
    (lineOf(leftShort, 'taxes')?.cents ?? 0) >=
      (lineOf(held, 'taxes')?.cents ?? 0),
    'releasing a hold never lowers a line below it',
  );
  const chosenTop = build([pair('rent', 110_000)], { 'd1:rent': 'topUp' });
  assert.equal(lineOf(chosenTop, 'rent')?.cents, 110_000);
  assert.equal(lineOf(chosenTop, 'rent')?.pairing?.state, 'toppedUp');
  assert.equal(chosenTop.heldCents, 0);

  // A hold on a Should never starves a Must; it takes only what the Must left.
  const shouldHeld = build([pair('save', 110_000)]);
  assert.equal(
    lineOf(shouldHeld, 'taxes')?.cents,
    40_000,
    'a Must takes the whole pool before a Should hold',
  );
  assert.equal(lineOf(shouldHeld, 'rent', 'd2')?.cents, 5_000);
  assert.equal(
    shouldHeld.heldCents,
    0,
    'a Should hold takes only what a Must left of the pool',
  );
  assert.equal(lineOf(shouldHeld, 'save')?.pairing?.state, 'held');
  assert.equal(total(shouldHeld), 150_000);

  // A Want is a plain short line: nothing held, a top-up is offered.
  const want = build([pair('fun', 110_000)]);
  assert.equal(lineOf(want, 'fun')?.pairing?.state, 'offered');
  assert.equal(want.heldCents, 0);
  assert.equal(lineOf(want, 'fun')?.shortBy, 10_000);
  assert.deepEqual(
    want.lines.filter((item) => item.pairing === null),
    build([pair('fun', 110_000)], { 'd1:fun': 'leaveShort' }).lines.filter(
      (item) => item.pairing === null,
    ),
    'a short Want reserves nothing',
  );
  const wantTop = build([pair('fun', 110_000)], { 'd1:fun': 'topUp' });
  assert.equal(lineOf(wantTop, 'fun')?.pairing?.state, 'toppedUp');
  assert.equal(
    lineOf(wantTop, 'fun')?.cents,
    100_000,
    'a Want top-up waits behind the Musts and Shoulds',
  );
  assert.equal(lineOf(wantTop, 'fun')?.shortBy, 10_000);

  // The narrowest set wins, and `rest` and `remaining` follow the order of the other pairings.
  const sets = {
    day: [pair('a', 1)],
    payLine: [pair('b', 1)],
    source: [pair('c', 1)],
  };
  const pick = (value: typeof sets) =>
    pickPairings(mkDay('x', on1, 1, value)).map((item) => item.targetItemId);
  assert.deepEqual(pick(sets), ['a'], 'the day wins');
  assert.deepEqual(
    pick({ ...sets, day: null as never }),
    ['b'],
    'else the pay line',
  );
  assert.deepEqual(
    pick({ ...sets, day: null as never, payLine: [] }),
    ['c'],
    'else the source',
  );
  const shares = buildDraft({
    days: [
      mkDay('d1', on1, 100_000, {
        ...none,
        payLine: [
          {
            targetItemId: 'fun',
            amount: { kind: 'rest' },
            topUpFromAnySource: false,
          },
          pair('rent', 40_000),
          {
            targetItemId: 'save',
            amount: { kind: 'percent', bps: 5_000, of: 'remaining' },
            topUpFromAnySource: false,
          },
        ],
      }),
    ],
    plan: { envelopes, bills: [], goals: [], horizon: 0, incomeDays },
    stance: 'conservative',
    overrides: { dayCents: {} },
  });
  assert.deepEqual(
    shares.lines.slice(0, 3).map((item) => [item.itemId, item.cents]),
    [
      ['rent', 40_000],
      ['save', 30_000],
      ['fun', 30_000],
    ],
    '50% of what is left is taken at its turn and the rest takes what remains',
  );

  // Properties over random pairings.
  const random = makeRandom(11);
  const ids = ['rent', 'taxes', 'save', 'fun'];
  Array.from({ length: 200 }).forEach(() => {
    const pairings = ids
      .filter(() => random() < 0.5)
      .map((id) => pair(id, Math.floor(random() * 160_000), random() < 0.2));
    const choices = Object.fromEntries(
      pairings
        .filter(() => random() < 0.4)
        .map((item) => [
          `d1:${item.targetItemId}`,
          random() < 0.5 ? ('topUp' as const) : ('leaveShort' as const),
        ]),
    );
    const draft = build(pairings, choices);
    assert.equal(
      total(draft),
      150_000,
      'lines, held money and free to spend equal the day money',
    );
    assert.ok(
      draft.lines.every((item) => item.cents >= 0 && item.shortBy >= 0),
    );
    assert.ok(
      draft.lines.every(
        (item) =>
          item.paidBy.reduce((sum, part) => sum + part.cents, 0) === item.cents,
      ),
      'paidBy adds to each line',
    );
    assert.deepEqual(
      build(shuffled(pairings, random), choices, shuffled(envelopes, random)),
      draft,
      'shuffled input gives the same draft',
    );
    const mustLines = (value: typeof draft) =>
      value.lines
        .filter((item) => item.tier === 'must' && item.pairing === null)
        .map((item) => [item.lineId, item.cents]);
    const shouldHolds = draft.lines.filter(
      (item) => item.tier === 'should' && item.pairing?.state === 'held',
    );
    if (shouldHolds.length > 0) {
      const withoutShouldHolds = build(pairings, {
        ...choices,
        ...Object.fromEntries(
          shouldHolds.map((item) => [item.lineId, 'leaveShort' as const]),
        ),
      });
      assert.deepEqual(
        mustLines(draft),
        mustLines(withoutShouldHolds),
        'a hold on a Should never changes what a Must gets',
      );
    }
    draft.lines
      .filter((item) => item.pairing?.state === 'held')
      .forEach((item) => {
        const lower = draft.lines.filter(
          (other) =>
            other.pairing === null &&
            (other.tier === 'want' ||
              (item.tier === 'must' && other.tier === 'should')),
        );
        assert.ok(
          lower.reduce((sum, other) => sum + other.cents, 0) +
            draft.heldCents +
            draft.freeToSpend.cents <=
            150_000,
          'nothing lower is funded from held money',
        );
      });
  });
}

// The planning stance picks the end of every range; an item's own stance replaces the plan's.
{
  const exact = (cents: number): MoneyRange => ({
    lowCents: cents,
    highCents: cents,
  });
  const STANCE_LIST = ['conservative', 'middle', 'optimistic'] as const;
  const on = utc(2026, 12, 4);
  const horizon = on + 60 * DAY_MS;
  const rangeIncome = { lowCents: 100_000, highCents: 160_000 };
  const rangeBill = { lowCents: 30_000, highCents: 42_000 };
  const dayOf = (
    id: string,
    amount: MoneyRange,
    stanceOverride: (typeof STANCE_LIST)[number] | null = null,
  ) => ({
    dayKey: toDayKey(id, on),
    sourceId: 'src',
    on,
    amount,
    stanceOverride,
  });
  const billOf = (
    itemId: string,
    amount: MoneyRange,
    stanceOverride: (typeof STANCE_LIST)[number] | null = null,
  ): DraftBillInput => ({
    itemId,
    createdAt: 1,
    priority: 'should',
    orderIndex: 1,
    amount,
    stanceOverride,
    schedule: { kind: 'once', anchor: on + 3 * DAY_MS, monthDays: [] },
    ending: NEVER,
    fundedBy: { kind: 'suggested' },
  });
  const tenPercent: DraftInput['plan']['envelopes'][number] = {
    itemId: 'tithe',
    createdAt: 1,
    priority: 'must',
    orderIndex: 1,
    funding: {
      amount: { kind: 'percent', bps: 1_000, of: 'dayMoney' },
      cadence: { kind: 'everyIncomeDay' },
    },
  };
  const draftAt = (
    stance: (typeof STANCE_LIST)[number],
    day: ReturnType<typeof dayOf>,
    bills: DraftBillInput[],
  ) =>
    buildDraft({
      days: [day],
      plan: {
        envelopes: [tenPercent],
        bills,
        goals: [],
        horizon,
        incomeDays: [
          {
            dayKey: day.dayKey,
            on,
            amount: day.amount,
            stanceOverride: day.stanceOverride,
          },
        ],
      },
      stance,
      overrides: { dayCents: {} },
    });
  const billTotal = (draft: ReturnType<typeof draftAt>) =>
    draft.lines.find((entry) => entry.itemId === 'rent')?.bill?.totalCents;

  assert.equal(pick('conservative', rangeIncome, 'income'), 100_000);
  assert.equal(pick('optimistic', rangeIncome, 'income'), 160_000);
  assert.equal(pick('conservative', rangeBill, 'expense'), 42_000);
  assert.equal(pick('optimistic', rangeBill, 'expense'), 30_000);
  assert.equal(
    pick('middle', { lowCents: 1, highCents: 2 }, 'income'),
    1,
    'the middle rounds down to whole cents',
  );

  const ranged = STANCE_LIST.map((stance) =>
    draftAt(stance, dayOf('pay', rangeIncome), [billOf('rent', rangeBill)]),
  );
  assert.deepEqual(
    ranged.map((draft) => draft.moneyCents),
    [100_000, 130_000, 160_000],
    'day money is low, middle, high under conservative, middle, optimistic',
  );
  assert.deepEqual(
    ranged.map(billTotal),
    [42_000, 36_000, 30_000],
    'a bill is planned at the opposite end',
  );
  assert.deepEqual(
    ranged.map(
      (draft) => draft.lines.find((entry) => entry.itemId === 'tithe')?.cents,
    ),
    [10_000, 13_000, 16_000],
    'a share of the day follows the picked day money',
  );
  assert.equal(
    new Set(ranged.map((draft) => JSON.stringify(draft))).size,
    3,
    'switching the stance changes every draft that uses a range',
  );

  const flat = STANCE_LIST.map((stance) =>
    draftAt(stance, dayOf('pay', exact(120_000)), [
      billOf('rent', exact(36_000)),
    ]),
  );
  assert.deepEqual(
    flat[1],
    flat[0],
    'a draft with no range ignores the stance (middle)',
  );
  assert.deepEqual(
    flat[2],
    flat[0],
    'a draft with no range ignores the stance (optimistic)',
  );

  const overridden = draftAt(
    'conservative',
    dayOf('pay', rangeIncome, 'optimistic'),
    [billOf('rent', rangeBill, 'optimistic')],
  );
  assert.equal(
    overridden.moneyCents,
    160_000,
    'a pay line plans at its own end',
  );
  assert.equal(billTotal(overridden), 30_000, 'a bill plans at its own end');
  assert.equal(
    overridden.lines.find((entry) => entry.itemId === 'rent')?.bill?.ranged
      ?.stance,
    'optimistic',
    'the line names the stance that picked its total',
  );
  assert.deepEqual(
    draftAt('conservative', dayOf('pay', rangeIncome, null), [
      billOf('rent', rangeBill, null),
    ]),
    ranged[0],
    'no override follows the plan',
  );

  assert.deepEqual(
    [undefined, null, '', 'bogus', 'Conservative'].map(readStance),
    Array.from({ length: 5 }, () => 'conservative'),
    'a missing or unknown stance reads as conservative',
  );
  assert.equal(effectiveStance('middle', undefined), 'middle');
  assert.equal(effectiveStance('middle', 'optimistic'), 'optimistic');
  assert.deepEqual(
    draftAt(readStance('bogus'), dayOf('pay', rangeIncome), [
      billOf('rent', rangeBill),
    ]),
    ranged[0],
    'a legacy plan plans conservatively',
  );
}

// Confirming a day.
{
  const today = utc(2026, 11, 1);
  const on = today + 3 * DAY_MS;
  const dayKey = toDayKey('pay', on);
  const exact = (cents: number) => ({ kind: 'exact' as const, cents });
  const envelope = (itemId: string, cents: number) => ({
    itemId,
    createdAt: 1_000,
    priority: 'must' as const,
    orderIndex: 1,
    funding: {
      amount: exact(cents),
      cadence: { kind: 'everyIncomeDay' as const },
    },
  });
  const draft = buildDraft({
    days: [
      {
        dayKey,
        sourceId: 's1',
        on,
        amount: { lowCents: 100_000, highCents: 100_000 },
      },
    ],
    plan: {
      envelopes: [envelope('rent', 40_000), envelope('food', 20_000)],
      bills: [],
      goals: [],
      horizon: 0,
      incomeDays: [{ dayKey, on }],
    },
    stance: 'conservative',
    overrides: { dayCents: {} },
  });
  const names = {
    rent: { name: 'Rent', emoji: null },
    food: { name: 'Food', emoji: '🛒' },
  };
  const input = {
    draft,
    names,
    stance: 'conservative' as const,
    fingerprint: 'f',
    note: null,
  };

  assert.equal(draft.freeToSpend.cents, 40_000);
  assert.equal(
    getFreeAfterArrival(draft, 100_000),
    40_000,
    'as expected leaves free to spend alone',
  );
  assert.equal(
    getFreeAfterArrival(draft, 112_500),
    52_500,
    'extra goes to free to spend',
  );
  assert.equal(
    getFreeAfterArrival(draft, 70_000),
    10_000,
    'a shortfall comes out of free to spend',
  );
  assert.equal(
    getFreeAfterArrival(draft, 60_000),
    0,
    'the least arrival leaves nothing free',
  );

  const same = buildRecords({ ...input, arrivedCents: 100_000 });
  assert.deepEqual(
    same.confirmed.differences,
    [],
    'as expected records no difference',
  );
  assert.deepEqual(
    same.proposed.lines,
    same.confirmed.lines,
    'the confirmed lines are the proposed ones',
  );
  assert.deepEqual(
    same.proposed.lines.map((line) => [
      line.itemId,
      line.name,
      line.cents,
      line.paidBy,
    ]),
    [
      ['food', 'Food', 20_000, [{ dayId: dayKey, cents: 20_000 }]],
      ['rent', 'Rent', 40_000, [{ dayId: dayKey, cents: 40_000 }]],
    ],
    'a line keeps its name and which day paid for it',
  );
  const more = buildRecords({
    ...input,
    arrivedCents: 112_500,
    note: 'Overtime',
  });
  assert.deepEqual(
    more.confirmed.differences,
    [
      {
        kind: 'amount',
        plannedCents: 100_000,
        actualCents: 112_500,
        note: 'Overtime',
      },
    ],
    'a different amount is one difference with its note',
  );
  assert.equal(
    more.proposed.freeToSpendCents,
    40_000,
    'the proposed draft is kept as it stood',
  );
  assert.equal(more.proposed.expectedCents, 100_000);
  assert.equal(more.confirmed.freeToSpendCents, 52_500);
  assert.equal(more.confirmed.arrivedCents, 112_500);

  const held = {
    ...draft,
    lines: draft.lines.map((line, index) =>
      index === 0
        ? { ...line, pairing: { state: 'held' as const, heldCents: 0 } }
        : line,
    ),
  };
  assert.equal(countUnresolvedHolds(draft), 0);
  assert.equal(countUnresolvedHolds(held), 1, 'a held line blocks confirming');
  assert.equal(
    countUnresolvedHolds({
      ...draft,
      lines: draft.lines.map((line) => ({
        ...line,
        pairing: { state: 'leftShort' as const, heldCents: 0 },
      })),
    }),
    0,
    'a chosen line does not block',
  );

  // Adjusting lines at confirmation.
  {
    const lines = same.proposed.lines;
    const food = lines.find((l) => l.itemId === 'food')!;
    const rent = lines.find((l) => l.itemId === 'rent')!;
    const extra = buildRecords({
      ...input,
      arrivedCents: 110_000,
      note: 'Bonus',
      edits: { [food.lineId]: 25_000, [rent.lineId]: 45_000 },
      lineNotes: { [food.lineId]: 'Stock up' },
    });
    assert.deepEqual(
      extra.confirmed.differences.map((d) =>
        d.kind === 'line'
          ? [d.kind, d.itemId, d.plannedCents, d.actualCents, d.note]
          : [d.kind, d.plannedCents, d.actualCents, d.note],
      ),
      [
        ['amount', 100_000, 110_000, 'Bonus'],
        ['line', 'food', 20_000, 25_000, 'Stock up'],
        ['line', 'rent', 40_000, 45_000, null],
      ],
      'exactly the changed lines are differences, with their notes',
    );
    assert.equal(
      sumLines(extra.confirmed.lines) + extra.confirmed.freeToSpendCents,
      110_000,
      'lines and free to spend add to the amount',
    );
    assert.equal(extra.confirmed.freeToSpendCents, 40_000);
    assert.deepEqual(
      extra.proposed.lines,
      lines,
      'the proposal keeps the draft lines',
    );
    assert.deepEqual(
      sumConfirmedByItem([
        {
          id: 'x',
          dayId: dayKey,
          createdAt: 1,
          kind: 'confirmed',
          payload: extra.confirmed,
        },
      ]),
      { food: 25_000, rent: 45_000 },
      'what a line was given counts toward its goal or envelope once',
    );
    const unchanged = buildRecords({
      ...input,
      arrivedCents: 100_000,
      edits: { [food.lineId]: 20_000 },
    });
    assert.deepEqual(
      unchanged.confirmed.differences,
      [],
      'an edit equal to the draft is no difference',
    );
    const lowered = applyLineEdits(lines, { [food.lineId]: 5_000 }, dayKey);
    const loweredFood = lowered.find((l) => l.itemId === 'food')!;
    assert.equal(
      loweredFood.shortBy,
      15_000,
      'a line cut below its demand is short by the rest',
    );
    assert.equal(
      loweredFood.paidBy.reduce((sum, p) => sum + p.cents, 0),
      5_000,
      'the days that paid for a line add to its amount',
    );
    const toBill = applyLineEdits(lines, { [food.lineId]: 0 }, dayKey).find(
      (l) => l.itemId === 'food',
    )!;
    assert.deepEqual(toBill.paidBy, [], 'a line at zero has no paying day');

    // A shortfall deeper than free to spend is taken from the lowest priority first.
    const mixed = [
      { ...rent, lineId: 'a', cents: 30_000, tier: 'must' as const },
      { ...rent, lineId: 'b', cents: 10_000, tier: 'want' as const },
      { ...rent, lineId: 'c', cents: 15_000, tier: 'should' as const },
      { ...rent, lineId: 'd', cents: 5_000, tier: 'want' as const },
    ];
    assert.deepEqual(suggestShortfall(mixed, 0), {});
    assert.deepEqual(
      suggestShortfall(mixed, 12_000),
      { d: 0, b: 3_000 },
      'later of the lowest tier first, never below zero',
    );
    const big = suggestShortfall(mixed, 40_000);
    assert.deepEqual(big, { d: 0, b: 0, c: 0, a: 20_000 });
    assert.equal(
      getRemainder(60_000 - 40_000, applyLineEdits(mixed, big, dayKey)),
      0,
      'a suggested shortfall leaves nothing negative',
    );
    // Every shuffle of the lines gives the same amounts per line.
    const shuffled = [mixed[2], mixed[0], mixed[3], mixed[1]];
    assert.deepEqual(
      suggestShortfall(shuffled, 12_000),
      { b: 0, d: 3_000 },
      'a lower tier is always taken before a higher one, whatever the order',
    );
    const lineSums = [0, 1_000, 33_333, 59_999, 60_000].map((need) => {
      const edits = suggestShortfall(mixed, need);
      const applied = applyLineEdits(mixed, edits, dayKey);
      return getRemainder(60_000 - need, applied);
    });
    assert.deepEqual(
      lineSums,
      [0, 0, 0, 0, 0],
      'taking exactly the shortfall leaves free to spend at zero',
    );
    assert.deepEqual(
      getLineDifferences(lines, lines, {}),
      [],
      'identical lines have no differences',
    );
  }

  // Confirmed lines count toward a goal's held money, from the confirmed record only.
  const record = (
    dayId: string,
    kind: 'proposed' | 'confirmed',
    lines: { itemId: string; cents: number }[],
  ): OpenRecord => {
    const payload = {
      ...same.confirmed,
      lines: lines.map((line) => ({ ...same.confirmed.lines[0], ...line })),
    } as ConfirmedSealed;
    return {
      id: `${dayId}_${kind}`,
      dayId,
      kind,
      createdAt: 1,
      payload,
    } as OpenRecord;
  };
  const records = [
    record('a', 'proposed', [{ itemId: 'goal', cents: 999 }]),
    record('a', 'confirmed', [
      { itemId: 'goal', cents: 15_000 },
      { itemId: 'food', cents: 20_000 },
    ]),
    record('b', 'confirmed', [{ itemId: 'goal', cents: 15_000 }]),
  ];
  assert.deepEqual(
    sumConfirmedByItem(records),
    { goal: 30_000, food: 20_000 },
    'held money adds the confirmed records and ignores the proposed ones',
  );
  assert.deepEqual(sumConfirmedByItem([]), {});

  const goalDays = [0, 14, 28, 42].map((offset) => {
    const dayOn = on + offset * DAY_MS;
    return { dayKey: toDayKey('pay', dayOn), on: dayOn, moneyCents: 100_000 };
  });
  const cushion = {
    targetCents: 60_000,
    heldCents: 0,
    funding: {
      amount: exact(15_000),
      cadence: { kind: 'everyIncomeDay' as const },
    },
  };
  assert.equal(
    planGoalContributions(cushion, goalDays).reduce(
      (sum, part) => sum + part.cents,
      0,
    ),
    60_000,
    'an unfunded goal asks for its whole target',
  );
  assert.deepEqual(
    planGoalContributions(
      { ...cushion, heldCents: 30_000 },
      goalDays.slice(2),
    ).map((part) => part.cents),
    [15_000, 15_000],
    'two confirmed contributions leave two to ask for',
  );
  assert.deepEqual(
    planGoalContributions({ ...cushion, heldCents: 60_000 }, goalDays),
    [],
    'a goal confirmed up to its target is not asked for again',
  );
  assert.equal(
    planGoalContributions({ ...cushion, heldCents: 75_000 }, goalDays).length,
    0,
    'held above the target asks for nothing',
  );

  // What the person set for a day is named the same whatever order it was written in.
  assert.equal(
    hashOverride({
      pairings: null,
      holdResolutions: { a: 'topUp', b: 'leaveShort' },
    }),
    hashOverride({
      pairings: null,
      holdResolutions: { b: 'leaveShort', a: 'topUp' },
    }),
    'hold order does not change the name',
  );
  assert.notEqual(
    hashOverride({ pairings: null, holdResolutions: { a: 'topUp' } }),
    hashOverride({ pairings: null, holdResolutions: { a: 'leaveShort' } }),
    'a different choice changes the name',
  );
  assert.notEqual(
    hashOverride({ pairings: null, holdResolutions: {} }),
    hashOverride({ pairings: [], holdResolutions: {} }),
    'no set of its own differs from an empty set',
  );

  // Days that passed without being confirmed are found by looking back from a date.
  const payLine: PlanItemDoc = {
    id: 'pay',
    kind: 'payLine',
    parentId: null,
    createdAt: 1,
    endedAt: null,
    archivedAt: null,
  };
  const payVersion: OpenVersion = {
    id: 'pay-v1',
    itemId: 'pay',
    kind: 'payLine',
    createdAt: 1,
    effectiveFrom: today - 100 * DAY_MS,
    effectiveUntil: null,
    changeId: 'c1',
    payload: {
      name: 'Paycheck',
      schedule: { kind: 'weekly', anchor: today - 20 * DAY_MS, monthDays: [] },
      amount: { lowCents: 100_000, highCents: 100_000 },
      ending: NEVER,
      stanceOverride: null,
      pairings: [],
    },
  };
  const ahead = buildComingDays([payLine], [payVersion], today);
  const lookback = buildComingDays(
    [payLine],
    [payVersion],
    today,
    today - 14 * DAY_MS,
  );
  assert.ok(
    ahead.every((entry) => entry.on >= today),
    'coming days start today',
  );
  assert.deepEqual(
    stamps(
      lookback.filter((entry) => entry.on < today).map((entry) => entry.on),
    ),
    stamps([today - 13 * DAY_MS, today - 6 * DAY_MS]),
    'looking back finds the days that passed inside the window',
  );
  assert.deepEqual(
    lookback.filter((entry) => entry.on >= today),
    ahead,
    'looking back changes nothing ahead',
  );
  assert.equal(
    describeDay([payVersion], {
      payLineId: 'pay',
      sourceId: null,
      expectedOn: today - 90 * DAY_MS,
    })?.payLineName,
    'Paycheck',
    'a day that has a document is described from the plan',
  );
  assert.equal(
    describeDay([payVersion], {
      payLineId: 'gone',
      sourceId: null,
      expectedOn: today,
    }),
    null,
    'a day whose pay line is gone is not described',
  );
}

// Bill progress: confirmed days and marks paid decide what a bill still asks for.
{
  const income = (stamp: number) => ({
    dayKey: `pay_${toDayStamp(stamp)}`,
    on: stamp,
  });
  const nov10 = utc(2026, 11, 10);
  const nov17 = utc(2026, 11, 17);
  const nov24 = utc(2026, 11, 24);
  const dec1 = utc(2026, 12, 1);
  const horizon = utc(2027, 3, 1);
  const rent = (over: Partial<DraftBillInput> = {}): DraftBillInput => ({
    itemId: 'rent',
    createdAt: 1,
    priority: 'must',
    orderIndex: 1,
    amount: { lowCents: 120_000, highCents: 120_000 },
    schedule: { kind: 'once', anchor: dec1, monthDays: [] },
    ending: NEVER,
    fundedBy: { kind: 'suggested' },
    ...over,
  });
  const funded = (on: number, cents: number) => ({
    dayKey: `pay_${toDayStamp(on)}`,
    on,
    cents,
  });
  const paidMark = (dueOn: number, over = {}) => ({
    moveId: getPaidMoveId('rent', dueOn, 0),
    dueOn,
    amountCents: 120_000,
    paidOn: nov10,
    fromFreeCents: 0,
    ...over,
  });
  const sum = (parts: { cents: number }[]) =>
    parts.reduce((total, part) => total + part.cents, 0);

  const untouched = planBillPayments(
    rent(),
    [income(nov10), income(nov17), income(nov24)],
    horizon,
  )[0];
  assert.deepEqual(
    untouched.parts.map((part) => part.cents),
    [40_000, 40_000, 40_000],
    'with nothing confirmed a bill spreads over every coming day',
  );
  assert.equal(untouched.fundedCents, 0);
  assert.equal(untouched.paid, null);

  const afterFirst = planBillPayments(
    rent({ progress: { funded: [funded(nov10, 40_000)], paid: [] } }),
    [income(nov17), income(nov24)],
    horizon,
  )[0];
  assert.deepEqual(
    afterFirst.parts.map((part) => part.cents),
    [40_000, 40_000],
    'a day already confirmed is not asked for again',
  );
  assert.equal(afterFirst.fundedCents, 40_000);
  assert.equal(
    afterFirst.fundedDays + afterFirst.parts.length,
    3,
    'a 3-day bill reads 1 of 3 after the first confirmed day',
  );
  assert.equal(afterFirst.fundedDays, 1);
  assert.equal(
    afterFirst.fundedCents + sum(afterFirst.parts),
    afterFirst.totalCents,
    'what is set aside plus what is still asked is the bill',
  );

  const half = planBillPayments(
    rent({ progress: { funded: [funded(nov10, 60_000)], paid: [] } }),
    [income(nov24)],
    horizon,
  )[0];
  assert.deepEqual(
    half.parts.map((part) => part.cents),
    [60_000],
    'a half-funded bill asks only for the other half',
  );
  const stranded = planBillPayments(
    rent({ progress: { funded: [funded(nov10, 60_000)], paid: [] } }),
    [],
    horizon,
  )[0];
  assert.ok(
    stranded.parts.length === 0 && stranded.fundedCents < stranded.totalCents,
    'a half-funded bill with no income day left waits',
  );

  const over = planBillPayments(
    rent({ progress: { funded: [funded(nov10, 150_000)], paid: [] } }),
    [income(nov17)],
    horizon,
  )[0];
  assert.deepEqual(
    over.parts.map((part) => part.cents),
    [0],
    'a bill set aside in full asks nothing more',
  );

  const lateDay = planBillPayments(
    rent({
      progress: { funded: [funded(utc(2026, 12, 3), 50_000)], paid: [] },
    }),
    [income(nov17)],
    horizon,
  )[0];
  assert.equal(
    lateDay.fundedCents,
    0,
    'a day after the due date funds a later payment, not this one',
  );

  const paidAhead = planBillPayments(
    rent({
      progress: { funded: [funded(nov10, 40_000)], paid: [paidMark(dec1)] },
    }),
    [income(nov17), income(nov24)],
    horizon,
  )[0];
  assert.equal(paidAhead.parts.length, 0, 'a bill paid ahead asks nothing');
  assert.equal(paidAhead.paid?.dueOn, dec1);
  assert.deepEqual(
    buildDemands(
      [
        {
          ...income(nov17),
          sourceId: null,
          amount: { lowCents: 1, highCents: 1 },
        },
      ],
      [income(nov17), income(nov24)],
      [],
      [rent({ progress: { funded: [], paid: [paidMark(dec1)] } })],
      horizon,
    ),
    [],
    'a paid bill makes no demand on any later day',
  );

  const monthlyRent = rent({
    schedule: { kind: 'monthly', anchor: dec1, monthDays: [1] },
  });
  const days = [
    income(nov24),
    income(utc(2026, 12, 15)),
    income(utc(2027, 1, 1)),
  ];
  const before = planBillPayments(monthlyRent, days, horizon);
  const paidOne = planBillPayments(
    { ...monthlyRent, progress: { funded: [], paid: [paidMark(dec1)] } },
    days,
    horizon,
  );
  assert.deepEqual(
    paidOne[1],
    { ...before[1], paid: null },
    'paying one payment leaves the next one as it was',
  );
  assert.equal(paidOne[0].paid?.moveId, 'paid_rent_20261201');

  const chosen = planBillPayments(
    rent({
      fundedBy: { kind: 'chosen', dayKeys: days.map((entry) => entry.dayKey) },
      progress: { funded: [funded(nov10, 30_000)], paid: [] },
    }),
    days,
    horizon,
  )[0];
  assert.equal(
    sum(chosen.parts),
    90_000,
    'chosen days share only what is left of the bill',
  );

  // Moves: the ids, the undo and the second mark.
  assert.equal(getPaidMoveId('rent', dec1, 0), 'paid_rent_20261201');
  assert.equal(getPaidMoveId('rent', dec1, 1), 'paid_rent_20261201_2');
  assert.equal(
    getUndoMoveId('paid_rent_20261201'),
    'unpaid_paid_rent_20261201',
  );
  const move = (id: string, over: Partial<OpenMove> = {}): OpenMove => ({
    id,
    kind: 'billPaid',
    date: dec1,
    refId: 'rent',
    reversesMoveId: null,
    createdAt: 1,
    payload: { amountCents: 120_000, paidOn: nov10, fromFreeCents: 20_000 },
    ...over,
  });
  const mark = move('paid_rent_20261201');
  const undo = move('unpaid_paid_rent_20261201', {
    reversesMoveId: mark.id,
  });
  assert.deepEqual(
    collectPaid([mark]).rent.map((entry) => entry.fromFreeCents),
    [20_000],
    'a mark is a paid payment and keeps what came from Free to spend',
  );
  assert.deepEqual(collectPaid([mark, undo]), {}, 'an undone mark is not paid');
  assert.equal(countMarks([mark, undo], 'rent', dec1), 1);
  const second = move(
    getPaidMoveId('rent', dec1, countMarks([mark, undo], 'rent', dec1)),
  );
  assert.equal(second.id, 'paid_rent_20261201_2');
  assert.deepEqual(
    collectPaid([mark, undo, second]).rent.map((entry) => entry.moveId),
    ['paid_rent_20261201_2'],
    'marking again after an undo is a new move beside the reversal',
  );
  assert.equal(
    countMarks([mark], 'rent', utc(2027, 1, 1)),
    0,
    'marks are counted for their own payment',
  );

  // Funded so far comes from confirmed records only.
  const record = (dayId: string, cents: number): OpenRecord => ({
    id: `${dayId}_confirmed`,
    dayId,
    createdAt: 1,
    kind: 'confirmed',
    payload: {
      fingerprint: 'x',
      stance: 'conservative',
      arrivedCents: 100_000,
      expectedCents: 100_000,
      freeToSpendCents: 0,
      differences: [],
      lines: [
        {
          lineId: `${dayId}:rent`,
          itemId: 'rent',
          name: 'Rent',
          emoji: null,
          tier: 'must',
          demandCents: cents,
          cents,
          shortBy: 0,
          paidBy: [],
        },
      ],
    },
  });
  const records = [record('pay_a', 40_000), record('pay_b', 20_000)];
  assert.deepEqual(
    collectFunded(records, new Map([['pay_a', nov10]])).rent,
    [{ dayKey: 'pay_a', on: nov10, cents: 40_000 }],
    'a record whose day is not known is left out',
  );
}

// Corrections: the latest one no later correction supersedes is the day's split; the original stays.
{
  const line = (itemId: string, cents: number) => ({
    lineId: `d:${itemId}`,
    itemId,
    name: itemId,
    emoji: null,
    tier: 'must' as const,
    demandCents: cents,
    cents,
    shortBy: 0,
    paidBy: [{ dayId: 'd', cents }],
  });
  const confirmed: OpenRecord = {
    id: 'd_confirmed',
    dayId: 'd',
    createdAt: 1,
    kind: 'confirmed',
    payload: {
      fingerprint: 'x',
      stance: 'conservative',
      arrivedCents: 100_000,
      expectedCents: 100_000,
      freeToSpendCents: 30_000,
      differences: [],
      lines: [line('goal', 40_000), line('rent', 30_000)],
    },
  };
  const base = getEffectiveSplit([confirmed]);
  assert.ok(base, 'a confirmed day has a split');
  const sealedOf = (
    from: NonNullable<typeof base>,
    edits: Record<string, number>,
    arrived = from.arrivedCents,
  ) =>
    buildCorrection({ base: from, arrivedCents: arrived, edits, note: null });
  const correct = (
    id: string,
    supersedesId: string,
    createdAt: number,
    payload: ReturnType<typeof sealedOf>,
  ): OpenRecord => ({
    id,
    dayId: 'd',
    createdAt,
    kind: 'correction',
    supersedesId,
    payload,
  });

  const first = sealedOf(base, { 'd:goal': 25_000 });
  assert.equal(
    first.arrivedCents - first.lines.reduce((sum, l) => sum + l.cents, 0),
    first.freeToSpendCents,
    'a correction still adds up to the amount that arrived',
  );
  assert.equal(
    first.freeToSpendCents,
    45_000,
    'lowering a line raises Free to spend',
  );
  assert.deepEqual(
    first.changes.map((c) => [c.lineId, c.beforeCents, c.afterCents]),
    [['d:goal', 40_000, 25_000]],
    'only the changed line is listed',
  );
  const c1 = correct('d_confirmed_corrected', 'd_confirmed', 2, first);
  assert.equal(
    sumConfirmedByItem([confirmed, c1]).goal,
    25_000,
    'a correction that lowers a goal line lowers its balance',
  );
  assert.equal(
    sumConfirmedByItem([confirmed, c1]).rent,
    30_000,
    'lines a correction leaves alone keep their amount',
  );

  const onDay = new Map([['d', utc(2027, 1, 10)]]);
  const rentRecords = [
    confirmed,
    correct(
      'd_confirmed_corrected',
      'd_confirmed',
      2,
      sealedOf(base, { 'd:rent': 12_000 }),
    ),
  ];
  assert.equal(
    collectFunded([confirmed], onDay).rent[0].cents,
    30_000,
    'before the correction a bill has what was confirmed',
  );
  assert.equal(
    collectFunded(rentRecords, onDay).rent[0].cents,
    12_000,
    'a correction that changes a bill line changes its funded progress',
  );

  const second = sealedOf(
    toSplit(c1 as Extract<OpenRecord, { kind: 'correction' }>),
    { 'd:goal': 10_000 },
    90_000,
  );
  const c2 = correct(
    'd_confirmed_corrected_corrected',
    'd_confirmed_corrected',
    3,
    second,
  );
  const chain = [c2, confirmed, c1];
  assert.deepEqual(
    getRecordChain(chain).map((r) => r.id),
    ['d_confirmed', 'd_confirmed_corrected', 'd_confirmed_corrected_corrected'],
    'a chain of two corrections resolves oldest to newest whatever order they are read in',
  );
  assert.equal(
    getEffectiveSplit(chain)?.recordId,
    c2.id,
    'the second correction is current',
  );
  assert.equal(getEffectiveSplit(chain)?.arrivedCents, 90_000);
  assert.equal(
    sumConfirmedByItem(chain).goal,
    10_000,
    'balances read the latest correction only',
  );
  assert.equal(
    getEffectiveSplit([
      confirmed,
      c1,
      c2,
      correct('stray', 'nothing', 9, first),
    ])?.recordId,
    c2.id,
    'a correction that replaces nothing on the chain is ignored',
  );
  const rival = correct(
    'rival',
    'd_confirmed',
    5,
    sealedOf(base, { 'd:goal': 1 }),
  );
  assert.equal(
    getEffectiveSplit([rival, c1, confirmed])?.recordId,
    c1.id,
    'two corrections of one record resolve to the earlier, the same on every device',
  );
  assert.equal(getEffectiveSplit([]), null, 'no confirmed record, no split');
  assert.deepEqual(
    getEffectiveSplits([
      confirmed,
      c1,
      { ...confirmed, id: 'e_confirmed', dayId: 'e' },
    ])
      .map((split) => [split.dayId, split.recordId])
      .sort(),
    [
      ['d', c1.id],
      ['e', 'e_confirmed'],
    ],
    'each day has one split',
  );
  assert.equal(getCorrectionId('d_confirmed'), 'd_confirmed_corrected');
  assert.deepEqual(
    keepTicks(['d:goal', 'd:rent', 'gone'], first.changes),
    ['d:rent', 'gone'],
    'a changed line is unticked and other ticks stay',
  );
  assert.deepEqual(
    keepTicks(['d:goal'], sealedOf(base, { 'd:goal': 0 }).changes),
    [],
    'a line corrected down to nothing is unticked',
  );
}

{
  // Starting point and balances: every figure is a sum of the ledger.
  const start = 10 * DAY_MS;
  const startMove = (
    id: string,
    refId: string | null,
    cents: number,
    createdAt: number,
    holding: 'money' | 'goal' | 'bill',
    date = start,
  ): OpenMove => ({
    id,
    kind: 'start',
    date,
    refId,
    reversesMoveId: null,
    createdAt,
    payload: { amountCents: cents, holding },
  });
  const moves: OpenMove[] = [
    startMove('m1', null, 100_000, 1, 'money'),
    startMove('g1', 'goal', 20_000, 1, 'goal'),
    startMove('b1', 'rent', 30_000, 1, 'bill'),
    startMove('m0', null, 5_000, 0, 'money', start - DAY_MS),
  ];
  assert.deepEqual(
    collectStarted(moves, start),
    { money: 100_000, byItem: { goal: 20_000, rent: 30_000 } },
    'the start moves of the start day count',
  );
  assert.deepEqual(
    collectStarted([...moves, startMove('m2', null, 90_000, 2, 'money')], start)
      .money,
    90_000,
    'a later run of the setup replaces an earlier holding',
  );
  assert.deepEqual(collectStarted(moves, null), { money: null, byItem: {} });
  const kinds = { goal: 'goal', rent: 'bill', food: 'envelope' } as const;
  const none = deriveBalances({
    startDate: start,
    moves,
    records: [],
    arrivedOn: new Map(),
    kinds,
  });
  assert.equal(none.moneyOnHandCents, 100_000);
  assert.equal(none.freeToSpendCents, 50_000, 'money less what is assigned');
  assert.deepEqual(getFreeToSpendFigure(none), {
    kind: 'amount',
    cents: 50_000,
  });
  const confirmedRecord = {
    id: 'd_confirmed',
    dayId: 'd',
    createdAt: 5,
    kind: 'confirmed' as const,
    payload: {
      fingerprint: 'x',
      stance: 'conservative' as const,
      arrivedCents: 40_000,
      expectedCents: 40_000,
      freeToSpendCents: 5_000,
      differences: [],
      lines: [
        {
          lineId: 'd:goal',
          itemId: 'goal',
          name: 'Goal',
          emoji: null,
          tier: 'should' as const,
          demandCents: 10_000,
          cents: 10_000,
          shortBy: 0,
          paidBy: [],
        },
        {
          lineId: 'd:food',
          itemId: 'food',
          name: 'Food',
          emoji: null,
          tier: 'must' as const,
          demandCents: 25_000,
          cents: 25_000,
          shortBy: 0,
          paidBy: [],
        },
      ],
    },
  };
  const after = deriveBalances({
    startDate: start,
    moves,
    records: [confirmedRecord],
    arrivedOn: new Map([['d', start + DAY_MS]]),
    kinds,
  });
  assert.equal(after.moneyOnHandCents, 140_000);
  assert.equal(after.assignedByItem.goal, 30_000);
  assert.equal(after.assignedByItem.food, 25_000);
  assert.equal(
    after.freeToSpendCents,
    50_000 + 5_000,
    'free to spend is the start free plus what the day left',
  );
  assert.equal(
    after.freeToSpendCents,
    after.moneyOnHandCents -
      after.assignedToBillsCents -
      after.assignedToGoalsCents -
      after.assignedToEnvelopesCents,
    'free to spend is the sum of the ledger',
  );
  assert.equal(
    deriveBalances({
      startDate: start,
      moves,
      records: [confirmedRecord],
      arrivedOn: new Map([['d', start - DAY_MS]]),
      kinds,
    }).moneyOnHandCents,
    100_000,
    'a day that arrived before the starting point is not counted',
  );
  const paid: OpenMove = {
    id: 'paid_rent_1',
    kind: 'billPaid',
    date: start + 5 * DAY_MS,
    refId: 'rent',
    reversesMoveId: null,
    createdAt: 6,
    payload: {
      amountCents: 40_000,
      paidOn: start + DAY_MS,
      fromFreeCents: 10_000,
    },
  };
  const paidBalances = deriveBalances({
    startDate: start,
    moves: [...moves, paid],
    records: [],
    arrivedOn: new Map(),
    kinds,
  });
  assert.equal(
    paidBalances.assignedByItem.rent,
    0,
    'a paid bill uses up its set-aside',
  );
  assert.equal(
    paidBalances.freeToSpendCents,
    40_000,
    'the part beyond what was set aside draws Free to spend',
  );
  const undo: OpenMove = {
    ...paid,
    id: 'unpaid_paid_rent_1',
    reversesMoveId: 'paid_rent_1',
    createdAt: 7,
  };
  assert.equal(
    deriveBalances({
      startDate: start,
      moves: [...moves, paid, undo],
      records: [],
      arrivedOn: new Map(),
      kinds,
    }).freeToSpendCents,
    50_000,
    'undoing the mark puts it back',
  );
  const over = deriveBalances({
    startDate: start,
    moves: [
      startMove('m', null, 10_000, 1, 'money'),
      startMove('g', 'goal', 20_000, 1, 'goal'),
    ],
    records: [],
    arrivedOn: new Map(),
    kinds,
  });
  assert.deepEqual(
    getFreeToSpendFigure(over),
    { kind: 'over', cents: 10_000 },
    'over-assigned is shown, never blocked',
  );
  assert.deepEqual(
    getFreeToSpendFigure(
      deriveBalances({
        startDate: start,
        moves: [startMove('g', 'goal', 20_000, 1, 'goal')],
        records: [],
        arrivedOn: new Map(),
        kinds,
      }),
    ),
    { kind: 'unknown' },
    'no money on hand is unknown, not zero',
  );
  assert.deepEqual(
    getFreeToSpendFigure(
      deriveBalances({
        startDate: null,
        moves,
        records: [],
        arrivedOn: new Map(),
        kinds,
      }),
    ),
    { kind: 'unknown' },
    'no starting point is unknown',
  );

  // A bill's starting set-aside feeds its payment but is not a funded day.
  const dayKeyStart = [{ dayKey: 'start', on: start, cents: 30_000 }];
  assert.equal(countFundedDays(dayKeyStart), 0);
  const dues = planBillPayments(
    {
      itemId: 'rent',
      createdAt: 0,
      priority: 'must',
      orderIndex: 1,
      amount: { lowCents: 100_000, highCents: 100_000 },
      stanceOverride: null,
      schedule: { kind: 'once', anchor: start + 20 * DAY_MS, monthDays: [] },
      ending: { onDate: null, afterCount: 1 },
      fundedBy: { kind: 'suggested' },
      progress: { funded: dayKeyStart, paid: [] },
    },
    [],
    start + 60 * DAY_MS,
  );
  assert.equal(
    dues[0].fundedCents,
    30_000,
    'the starting amount counts toward the first payment',
  );
  assert.equal(dues[0].fundedDays, 0);
}

// Change an item from a date (Issue 18).
{
  const today = utc(2026, 10, 23);
  const exactRange = (cents: number) => ({ lowCents: cents, highCents: cents });
  const never = { onDate: null, afterCount: null };
  const weekly = { kind: 'weekly', anchor: today, monthDays: [] } as const;
  const planItems: PlanItemDoc[] = [
    item('pay', 1, { kind: 'payLine', parentId: 'src' }),
    item('src', 1),
    item('groc', 2, { kind: 'envelope' }),
  ];
  const payload = (cents: number) => ({
    name: 'Groceries',
    emoji: null,
    priority: 'must' as const,
    orderIndex: 1,
    funding: {
      amount: { kind: 'exact' as const, cents },
      cadence: { kind: 'everyIncomeDay' as const },
    },
  });
  const base: OpenVersion[] = [
    {
      id: 'vsrc',
      itemId: 'src',
      kind: 'source',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: { name: 'Acme', pairings: [] },
    },
    {
      id: 'vpay',
      itemId: 'pay',
      kind: 'payLine',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: {
        name: 'Paycheck',
        schedule: weekly,
        amount: exactRange(100_000),
        ending: never,
        stanceOverride: null,
        pairings: [],
      },
    },
    {
      id: 'vgroc',
      itemId: 'groc',
      kind: 'envelope',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: payload(10_000),
    },
  ];
  const from = today + 21 * DAY_MS;
  const inputs = {
    items: planItems,
    versions: base,
    openDays: [],
    stance: 'conservative' as const,
    today,
    heldByItem: {},
    settledKey: '',
    billProgress: {},
  };
  const virtual = {
    itemId: 'groc',
    kind: 'envelope' as const,
    effectiveFrom: from,
    effectiveUntil: null,
    changeId: 'what-if',
    payload: payload(15_000),
  };
  const preview = previewChange(inputs, { kind: 'version', version: virtual });
  assert.ok(preview.length > 0, 'a raise from a date moves later days');
  assert.ok(
    preview.every((day) => day.on >= from),
    'a change from a date ahead leaves every earlier day alone',
  );
  assert.ok(
    preview.every(
      (day) => day.effect.freeAfterCents === day.effect.freeBeforeCents - 5_000,
    ),
    'each later day gives $50 more to the envelope',
  );
  assert.deepEqual(
    previewChange(inputs, {
      kind: 'version',
      version: { ...virtual, effectiveFrom: today + 400 * DAY_MS },
    }),
    [],
    'a change past the days planned moves nothing',
  );
  assert.ok(
    previewChange(inputs, {
      kind: 'version',
      version: { ...virtual, effectiveFrom: today + 300 * DAY_MS },
    }).length > 0,
    'a change beyond the first days listed is still found',
  );
  assert.equal(
    getChangeSpan(
      { ...INITIAL_FROM_WHEN, choice: 'date', date: '2037-01-01' },
      { today, days: [], presetDayKey: null },
    ).span,
    null,
    'a start more than ten years out is refused here, as the rules do',
  );

  // The previewed effect equals the saved result.
  const saved: OpenVersion = {
    ...virtual,
    id: 'vsaved',
    createdAt: 5,
  } as OpenVersion;
  const layered = layerVersion<OpenVersion>(base, virtual);
  const dayKeys = buildComingDays(planItems, base, today).map(
    (day) => day.dayKey,
  );
  const draftsOf = (versions: OpenVersion[]) =>
    dayKeys.map(
      (dayKey) =>
        computeDraftView(
          planItems,
          versions,
          'conservative',
          [],
          dayKey,
          today,
          {},
          '',
          {},
        )?.draft,
    );
  assert.deepEqual(
    draftsOf(layered),
    draftsOf([...base, saved]),
    'the preview is the saved result for the same inputs',
  );

  // Two devices: both versions stay and the later one wins, whatever the order.
  const first = {
    ...saved,
    id: 'dev1',
    createdAt: 10,
    payload: payload(12_000),
  };
  const second = {
    ...saved,
    id: 'dev2',
    createdAt: 11,
    payload: payload(14_000),
  };
  const cents = (list: OpenVersion[]) => {
    const found = resolveVersion(list, 'groc', from + 7 * DAY_MS);
    return found?.kind === 'envelope' &&
      found.payload.funding.amount.kind === 'exact'
      ? found.payload.funding.amount.cents
      : null;
  };
  assert.equal(
    cents([...base, first as OpenVersion, second as OpenVersion]),
    14_000,
  );
  assert.equal(
    cents([...base, second as OpenVersion, first as OpenVersion]),
    14_000,
  );
  assert.equal(cents([...base, first as OpenVersion]), 12_000);
  assert.equal(
    resolveVersion([...base, second as OpenVersion], 'groc', today)?.id,
    'vgroc',
    'before the date the earlier version still stands',
  );

  // The next change that has not started.
  assert.equal(
    resolveNextChange([...base, saved], 'groc', today)?.id,
    'vsaved',
  );
  assert.equal(resolveNextChange([...base, saved], 'groc', from), null);
  assert.equal(resolveNextChange(base, 'groc', today), null);
  assert.equal(
    resolveNextChange(base, 'groc', today - 10 * DAY_MS),
    null,
    'an item that has not begun has no change scheduled, only a start',
  );
  assert.equal(
    resolveNextChange(
      [
        ...base,
        {
          ...saved,
          id: 'hidden',
          createdAt: 3,
          effectiveFrom: from + DAY_MS,
        } as OpenVersion,
        {
          ...saved,
          id: 'wins',
          createdAt: 9,
          effectiveFrom: from,
        } as OpenVersion,
      ],
      'groc',
      today,
    )?.id,
    'wins',
  );

  // A schedule that changes from a date: the old one stops the day before.
  const monthly: OpenVersion = {
    id: 'vpay2',
    itemId: 'pay',
    kind: 'payLine',
    createdAt: 2,
    effectiveFrom: from,
    effectiveUntil: null,
    changeId: 'c2',
    payload: {
      name: 'Paycheck',
      schedule: {
        kind: 'monthly',
        anchor: from,
        monthDays: [new Date(from).getUTCDate()],
      },
      amount: exactRange(100_000),
      ending: never,
      stanceOverride: null,
      pairings: [],
    },
  };
  const days = buildComingDays(planItems, [...base, monthly], today);
  assert.deepEqual(
    days.filter((day) => day.on < from).map((day) => day.on),
    [today, today + 7 * DAY_MS, today + 14 * DAY_MS],
    'days before the change keep the weekly schedule',
  );
  const after = days.filter((day) => day.on >= from);
  assert.ok(
    after.length > 0 && after.length <= 14,
    'days from the change are monthly',
  );
  assert.ok(
    after.every(
      (day) =>
        new Date(day.on).getUTCDate() === new Date(from).getUTCDate() ||
        day.on === from,
    ),
    'monthly on the new day',
  );

  // A day that was already described keeps what it had.
  assert.equal(
    describeDay([...base, monthly], {
      payLineId: 'pay',
      sourceId: 'src',
      expectedOn: today + 7 * DAY_MS,
    })?.amount.lowCents,
    100_000,
  );
  assert.equal(
    describeChange(
      payload(10_000) as ItemPayload,
      payload(15_000) as ItemPayload,
    ),
    'Funding $100.00 every income day to $150.00 every income day',
  );
  const legacyLine = {
    name: 'Paycheck',
    schedule: weekly,
    amount: exactRange(100_000),
    ending: never,
  } as unknown as ItemPayload;
  assert.equal(
    describeChange(legacyLine, {
      ...legacyLine,
      amount: exactRange(120_000),
      pairings: [],
      stanceOverride: null,
    } as ItemPayload),
    'Amount $1,000.00 to $1,200.00',
    'a pay line written before pairings and ranges existed can be changed',
  );
  assert.equal(
    isSamePayload(
      payload(10_000) as ItemPayload,
      payload(10_000) as ItemPayload,
    ),
    true,
  );
  const spanContext = (presetDayKey: string | null = null) => ({
    today,
    days: buildComingDays(planItems, base, today),
    presetDayKey,
  });
  assert.equal(
    getChangeSpan(
      { ...INITIAL_FROM_WHEN, choice: 'date', date: '2026-10-23' },
      spanContext(),
    ).span,
    null,
    'a date that is not after today is refused',
  );
  assert.deepEqual(
    getChangeSpan(
      { ...INITIAL_FROM_WHEN, choice: 'date', date: '2026-10-24' },
      spanContext(),
    ).span,
    { kind: 'version', effectiveFrom: today + DAY_MS, effectiveUntil: null },
  );
  assert.deepEqual(getChangeSpan(INITIAL_FROM_WHEN, spanContext()).span, {
    kind: 'version',
    effectiveFrom: today,
    effectiveUntil: null,
  });

  // 50 envelopes: the preview of one change over every coming day stays quick.
  const many = Array.from({ length: 50 }, (_, index) => index);
  const manyItems = [
    ...planItems.filter((entry) => entry.kind !== 'envelope'),
    ...many.map((index) =>
      item(`e${index}`, index + 2, { kind: 'envelope' as const }),
    ),
  ];
  const manyVersions: OpenVersion[] = [
    ...base.filter((entry) => entry.kind !== 'envelope'),
    ...many.map((index): OpenVersion => ({
      id: `ve${index}`,
      itemId: `e${index}`,
      kind: 'envelope',
      createdAt: index + 2,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: { ...payload(1_000 + index), name: `Envelope ${index}` },
    })),
  ];
  const startedAt = performance.now();
  const manyPreview = previewChange(
    { ...inputs, items: manyItems, versions: manyVersions },
    {
      kind: 'version',
      version: { ...virtual, itemId: 'e7', payload: payload(5_000) },
    },
  );
  const elapsed = performance.now() - startedAt;
  assert.ok(manyPreview.length > 0);
  assert.ok(
    elapsed < 1_500,
    `50-envelope preview took ${elapsed.toFixed(0)} ms`,
  );
  console.log(
    `runway engine: 50-envelope change preview over ${manyPreview.length} days ${elapsed.toFixed(0)} ms`,
  );
}

// Change for a stretch, for one income day, or end it (Issue 19).
{
  const today = utc(2026, 10, 23);
  const exact = (cents: number) => ({ lowCents: cents, highCents: cents });
  const weekly = { kind: 'weekly', anchor: today, monthDays: [] } as const;
  const planItems: PlanItemDoc[] = [
    item('pay', 1, { kind: 'payLine', parentId: 'src' }),
    item('src', 1),
    item('vac', 2, { kind: 'envelope' }),
    item('fun', 3, { kind: 'goal' }),
  ];
  const envelope = (cents: number) => ({
    name: 'Vacation fund',
    emoji: null,
    priority: 'must' as const,
    orderIndex: 1,
    funding: {
      amount: { kind: 'exact' as const, cents },
      cadence: { kind: 'everyIncomeDay' as const },
    },
  });
  const goalPayload = (state?: 'active' | 'paused') =>
    ({
      name: 'Laptop',
      emoji: null,
      priority: 'should' as const,
      orderIndex: 1,
      targetCents: 100_000,
      targetDate: null,
      funding: {
        amount: { kind: 'exact' as const, cents: 5_000 },
        cadence: { kind: 'everyIncomeDay' as const },
      },
      ...(state ? { state } : {}),
    }) as never;
  const make = (
    id: string,
    itemId: string,
    kind: 'envelope' | 'goal',
    createdAt: number,
    payload: unknown,
    over: { effectiveFrom?: number; effectiveUntil?: number | null } = {},
  ): OpenVersion =>
    ({
      id,
      itemId,
      kind,
      createdAt,
      effectiveFrom: over.effectiveFrom ?? today,
      effectiveUntil: over.effectiveUntil ?? null,
      changeId: 'c',
      payload,
    }) as OpenVersion;
  const base: OpenVersion[] = [
    {
      id: 'vsrc',
      itemId: 'src',
      kind: 'source',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: { name: 'Acme', pairings: [] },
    },
    {
      id: 'vpay',
      itemId: 'pay',
      kind: 'payLine',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: {
        name: 'Paycheck',
        schedule: weekly,
        amount: exact(100_000),
        ending: NEVER,
        stanceOverride: null,
        pairings: [],
      },
    },
    make('vvac', 'vac', 'envelope', 2, envelope(30_000)),
  ];
  const coming = buildComingDays(planItems, base, today);
  const dayKeys = coming.map((day) => day.dayKey);
  const draftFor = (
    items: PlanItemDoc[],
    versions: OpenVersion[],
    dayKey: string,
    openDays: never[] = [],
    settledKey = '',
  ) =>
    computeDraftView(
      items,
      versions,
      'conservative',
      openDays,
      dayKey,
      today,
      {},
      settledKey,
      {},
    );
  const lineOf = (view: ReturnType<typeof draftFor>, itemId: string) =>
    view?.draft.lines.find((line) => line.itemId === itemId) ?? null;

  // A stretch of N income days: the earlier amount returns after it with nothing written, and says so once.
  const end = getStretchEnd(coming, today, 3);
  assert.equal(
    end,
    coming[2].on + DAY_MS,
    'three income days end after the third',
  );
  assert.equal(
    getStretchEnd(coming, today, 0),
    null,
    'a count below one is no stretch',
  );
  assert.equal(
    getStretchEnd(coming.slice(0, 2), today, 3),
    null,
    'a count past the days planned is refused',
  );
  const stretch = make('vstretch', 'vac', 'envelope', 10, envelope(10_000), {
    effectiveUntil: end,
  });
  const stretched = [...base, stretch];
  const cents = (index: number) =>
    lineOf(draftFor(planItems, stretched, dayKeys[index]), 'vac')?.cents;
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(cents),
    [10_000, 10_000, 10_000, 30_000, 30_000],
    'the stretch covers its days and the earlier amount returns on the next',
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(
      (index) =>
        lineOf(draftFor(planItems, stretched, dayKeys[index]), 'vac')?.reason
          .code,
    ),
    ['funded', 'funded', 'funded', 'returns', 'funded'],
    'the first day back at the earlier amount says it returns, once',
  );
  assert.equal(
    describeLineReason(
      lineOf(draftFor(planItems, stretched, dayKeys[3]), 'vac')!,
      {},
      'Vacation fund',
    ),
    'Vacation fund returns to $300.00 this time',
  );
  assert.equal(
    lineOf(draftFor(planItems, base, dayKeys[3]), 'vac')?.reason.code,
    'funded',
    'an item with no stretch never says it returns',
  );
  assert.deepEqual(
    [...findReturning(stretched, ['vac', 'fun'], coming[3].on, coming[2].on)],
    ['vac'],
  );
  assert.deepEqual(
    [...findReturning(stretched, ['vac'], coming[4].on, coming[3].on)],
    [],
    'it returns only on the first day after the stretch',
  );
  const later = make('vlater', 'vac', 'envelope', 11, envelope(20_000), {
    effectiveFrom: today,
  });
  assert.deepEqual(
    [
      ...findReturning(
        [...stretched, later],
        ['vac'],
        coming[3].on,
        coming[2].on,
      ),
    ],
    [],
    'a later permanent change that wins the whole time leaves nothing to return',
  );

  // Until a date: the last day is included.
  const until = getChangeSpan(
    {
      ...INITIAL_FROM_WHEN,
      choice: 'stretch',
      stretch: 'until',
      until: '2026-11-06',
    },
    { today, days: coming, presetDayKey: null },
  );
  assert.deepEqual(until.span, {
    kind: 'version',
    effectiveFrom: today,
    effectiveUntil: utc(2026, 11, 7),
  });
  assert.equal(
    getChangeSpan(
      {
        ...INITIAL_FROM_WHEN,
        choice: 'stretch',
        stretch: 'until',
        until: '2026-10-22',
      },
      { today, days: coming, presetDayKey: null },
    ).span,
    null,
    'a last day before today is refused',
  );
  assert.equal(
    getChangeSpan(
      {
        ...INITIAL_FROM_WHEN,
        choice: 'stretch',
        stretch: 'count',
        count: '999',
      },
      { today, days: coming, presetDayKey: null },
    ).span,
    null,
  );
  assert.deepEqual(
    getChangeSpan(
      { ...INITIAL_FROM_WHEN, choice: 'stretch', stretch: 'count', count: '3' },
      { today, days: coming, presetDayKey: null },
    ).span,
    { kind: 'version', effectiveFrom: today, effectiveUntil: end },
  );

  // The previewed stretch is the saved one.
  const stretchPreview = previewChange(
    {
      items: planItems,
      versions: base,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    {
      kind: 'version',
      version: {
        itemId: 'vac',
        kind: 'envelope',
        effectiveFrom: today,
        effectiveUntil: end,
        changeId: 'what-if',
        payload: envelope(10_000),
      },
    },
  );
  assert.deepEqual(
    stretchPreview.map((day) => day.dayKey),
    dayKeys.slice(0, 3),
    'a stretch of three days moves three days and none after',
  );
  assert.ok(
    stretchPreview.every(
      (day) =>
        day.effect.freeAfterCents - day.effect.freeBeforeCents === 20_000,
    ),
  );
  assert.deepEqual(
    stretchPreview.map((day) => day.effect.freeAfterCents),
    dayKeys
      .slice(0, 3)
      .map(
        (key) => draftFor(planItems, stretched, key)?.draft.freeToSpend.cents,
      ),
    'the previewed stretch equals the saved result',
  );

  // One income day only: a day's own payload, no version.
  const target = coming[1];
  const dayOverride = {
    id: target.dayKey,
    payLineId: 'pay',
    sourceId: 'src',
    expectedOn: target.on,
    arrivedOn: null,
    confirmedAt: null,
    status: 'draft' as const,
    doneLineIds: [],
    override: {
      pairings: null,
      holdResolutions: {},
      payloads: { vac: envelope(5_000) },
    },
  };
  const withDay = [dayOverride] as never[];
  assert.deepEqual(
    dayKeys
      .slice(0, 4)
      .map(
        (key) => lineOf(draftFor(planItems, base, key, withDay), 'vac')?.cents,
      ),
    [30_000, 5_000, 30_000, 30_000],
    'one income day takes its own amount and its neighbours keep the plan',
  );
  assert.equal(
    lineOf(draftFor(planItems, base, dayKeys[2], withDay), 'vac')?.reason.code,
    'funded',
    'a day-only change does not say the next day returns',
  );
  const legacyDay = [
    { ...dayOverride, override: { pairings: null, holdResolutions: {} } },
  ] as never[];
  assert.equal(
    lineOf(draftFor(planItems, base, target.dayKey, legacyDay), 'vac')?.cents,
    30_000,
    'a day written before payloads existed follows the plan',
  );
  const dayPreview = previewChange(
    {
      items: planItems,
      versions: base,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    {
      kind: 'day',
      day: {
        dayKey: target.dayKey,
        payLineId: 'pay',
        sourceId: 'src',
        on: target.on,
      },
      itemId: 'vac',
      payload: envelope(5_000),
    },
  );
  assert.deepEqual(
    dayPreview.map((day) => day.dayKey),
    [target.dayKey],
    'a day-only change moves that day and no other',
  );
  assert.equal(
    dayPreview[0].effect.freeAfterCents,
    draftFor(planItems, base, target.dayKey, withDay)?.draft.freeToSpend.cents,
    'the previewed day equals the saved day',
  );
  assert.notEqual(
    hashOverride({
      pairings: null,
      holdResolutions: {},
      payloads: { vac: envelope(5_000) },
    }),
    hashOverride({ pairings: null, holdResolutions: {} }),
    'a day-only payload changes the day fingerprint',
  );
  assert.equal(
    hashOverride({ pairings: null, holdResolutions: {}, payloads: {} }),
    hashOverride({ pairings: null, holdResolutions: {} }),
    'an empty set of payloads is the legacy fingerprint',
  );

  // Confirmed days never move: a settled day is not in any preview.
  const settledPreview = previewChange(
    {
      items: planItems,
      versions: base,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: dayKeys[0],
      billProgress: {},
    },
    { kind: 'end', itemId: 'vac', endedAt: today - DAY_MS },
  );
  assert.ok(
    !settledPreview.some((day) => day.dayKey === dayKeys[0]),
    'a confirmed day is left out of what a change shows',
  );
  assert.ok(settledPreview.length > 0);

  // End at a date: the item counts through that day and is gone the next.
  const endedOn = coming[2].on;
  const endedItems = planItems.map((entry) =>
    entry.id === 'vac' ? { ...entry, endedAt: endedOn } : entry,
  );
  assert.deepEqual(
    [0, 2, 3].map(
      (index) =>
        lineOf(draftFor(endedItems, base, dayKeys[index]), 'vac')?.cents ??
        null,
    ),
    [30_000, 30_000, null],
    'an ended envelope funds through its last day and not after',
  );
  assert.equal(
    resolveVersion(base, 'vac', coming[5].on)?.id,
    'vvac',
    'its versions still resolve for any date',
  );
  const endPreview = previewChange(
    {
      items: planItems,
      versions: base,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    { kind: 'end', itemId: 'vac', endedAt: endedOn },
  );
  assert.ok(endPreview.every((day) => day.on > endedOn));
  assert.deepEqual(
    endPreview.slice(0, 3).map((day) => day.effect.freeAfterCents),
    dayKeys
      .slice(3, 6)
      .map((key) => draftFor(endedItems, base, key)?.draft.freeToSpend.cents),
    'the previewed ending equals the saved one',
  );
  const endedPayLine = planItems.map((entry) =>
    entry.id === 'pay' ? { ...entry, endedAt: coming[3].on } : entry,
  );
  assert.equal(
    buildComingDays(endedPayLine, base, today).at(-1)?.on,
    coming[3].on,
    'an ended pay line has no income days after its last',
  );

  // Archive: gone from today on, still resolved for the days before it.
  const archived = planItems.map((entry) =>
    entry.id === 'vac' ? { ...entry, archivedAt: today } : entry,
  );
  assert.equal(
    resolve(
      archived.filter((e) => e.id === 'vac'),
      base.filter((v) => v.itemId === 'vac'),
      today,
    ).length,
    0,
    'an archived envelope is off the lists from today',
  );
  assert.equal(
    resolve(
      archived
        .filter((e) => e.id === 'vac')
        .map((e) => ({ ...e, archivedAt: today + 2 * DAY_MS })),
      base.filter((v) => v.itemId === 'vac'),
      today + DAY_MS,
    ).length,
    1,
    'an archived envelope still resolves for earlier days',
  );
  assert.equal(
    lineOf(draftFor(archived, base, dayKeys[0]), 'vac'),
    null,
    'the coming drafts no longer fund it',
  );
  const record = {
    id: 'r1',
    dayId: 'pay_20261016',
    createdAt: 1,
    kind: 'confirmed' as const,
    payload: {
      fingerprint: 'f',
      stance: 'conservative' as const,
      arrivedCents: 100_000,
      expectedCents: 100_000,
      freeToSpendCents: 70_000,
      differences: [],
      lines: [
        {
          lineId: 'pay_20261016:vac',
          itemId: 'vac',
          name: 'Vacation fund',
          emoji: null,
          tier: 'must' as const,
          demandCents: 30_000,
          cents: 30_000,
          shortBy: 0,
          paidBy: [],
        },
      ],
    },
  };
  assert.deepEqual(
    sumConfirmedByItem([record]),
    { vac: 30_000 },
    'what a confirmed day gave an archived item still counts',
  );
  const archivePreview = previewChange(
    {
      items: planItems,
      versions: base,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    { kind: 'archive', itemId: 'vac', archivedAt: today },
  );
  assert.deepEqual(
    archivePreview.map((day) => day.effect.freeAfterCents),
    archivePreview.map((day) => day.effect.freeBeforeCents + 30_000),
    'archiving shows each coming day giving its money back to Free to spend',
  );

  // Pause and resume a goal: a paused goal demands nothing, a legacy one is active.
  const goalBase = [...base, make('vfun', 'fun', 'goal', 3, goalPayload())];
  assert.equal(
    lineOf(draftFor(planItems, goalBase, dayKeys[0]), 'fun')?.cents,
    5_000,
    'a goal written before states existed is active',
  );
  const paused = [
    ...goalBase,
    make('vpause', 'fun', 'goal', 20, goalPayload('paused')),
  ];
  assert.equal(
    lineOf(draftFor(planItems, paused, dayKeys[0]), 'fun'),
    null,
    'a paused goal gets nothing',
  );
  const resumed = [
    ...paused,
    make('vresume', 'fun', 'goal', 21, goalPayload('active'), {
      effectiveFrom: coming[2].on,
    }),
  ];
  assert.deepEqual(
    [1, 2].map(
      (index) =>
        lineOf(draftFor(planItems, resumed, dayKeys[index]), 'fun')?.cents ??
        null,
    ),
    [null, 5_000],
    'resuming gives it money again from its date',
  );
  const pausePreview = previewChange(
    {
      items: planItems,
      versions: goalBase,
      openDays: [],
      stance: 'conservative',
      today,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    {
      kind: 'version',
      version: {
        itemId: 'fun',
        kind: 'goal',
        effectiveFrom: today,
        effectiveUntil: null,
        changeId: 'what-if',
        payload: goalPayload('paused'),
      },
    },
  );
  assert.ok(
    pausePreview.every(
      (day) => day.effect.freeAfterCents - day.effect.freeBeforeCents === 5_000,
    ) && pausePreview.length > 0,
    'pausing shows $50 returning to Free to spend on each day',
  );

  // A pay line's ending, reached.
  const threeTimes = { onDate: null, afterCount: 3 };
  const isNever = () => false;
  assert.equal(
    findReachedEnding(weekly, threeTimes, today + 14 * DAY_MS, isNever),
    null,
    'the last income day is today and not confirmed yet',
  );
  assert.equal(
    findReachedEnding(weekly, threeTimes, today + 14 * DAY_MS, () => true),
    today + 14 * DAY_MS,
    'confirming the last income day reaches the ending',
  );
  assert.equal(
    findReachedEnding(weekly, threeTimes, today + 15 * DAY_MS, isNever),
    today + 14 * DAY_MS,
    'the first load after the last income day reaches it',
  );
  assert.equal(
    findReachedEnding(weekly, threeTimes, today + 7 * DAY_MS, () => true),
    null,
    'income days still to come mean it has not ended',
  );
  assert.equal(
    findReachedEnding(weekly, NEVER, today + 900 * DAY_MS, isNever),
    null,
  );
  assert.equal(
    findReachedEnding(
      weekly,
      { onDate: today + 10 * DAY_MS, afterCount: null },
      today + 11 * DAY_MS,
      isNever,
    ),
    today + 7 * DAY_MS,
    'an end date ends it on its last income day before the date',
  );
  assert.equal(
    findReachedEnding(
      { ...weekly, kind: 'once' },
      NEVER,
      today + DAY_MS,
      isNever,
    ),
    today,
    'a one-time pay line ends after its day',
  );
  // A bill ended before its next due date plans nothing for that date.
  const rentItems: PlanItemDoc[] = [
    ...planItems,
    item('rent', 4, { kind: 'bill' }),
  ];
  const rent = {
    id: 'vrent',
    itemId: 'rent',
    kind: 'bill',
    createdAt: 4,
    effectiveFrom: today,
    effectiveUntil: null,
    changeId: 'c',
    payload: {
      name: 'Rent',
      emoji: null,
      priority: 'must',
      orderIndex: 1,
      amount: exact(50_000),
      timing: {
        kind: 'date',
        schedule: {
          kind: 'monthly',
          anchor: today + 14 * DAY_MS,
          monthDays: [6],
        },
      },
      ending: NEVER,
      fundedBy: { kind: 'suggested' },
      stanceOverride: null,
    },
  } as unknown as OpenVersion;
  const rentLine = (items: PlanItemDoc[]) =>
    lineOf(draftFor(items, [...base, rent], dayKeys[0]), 'rent')?.cents ?? null;
  assert.ok((rentLine(rentItems) ?? 0) > 0, 'a live bill is funded');
  assert.equal(
    rentLine(
      rentItems.map((entry) =>
        entry.id === 'rent' ? { ...entry, endedAt: today } : entry,
      ),
    ),
    null,
    'a bill ended before its next due date is not funded for it',
  );
  assert.deepEqual(capEnding(NEVER, null), NEVER);
  assert.deepEqual(
    capEnding({ onDate: today + DAY_MS, afterCount: 2 }, today),
    {
      onDate: today,
      afterCount: 2,
    },
  );

  // The sweep leaves a pay line alone while a later version is scheduled.
  const sweepItems: PlanItemDoc[] = [item('p2', 1, { kind: 'payLine' })];
  const sweepVersion = (
    id: string,
    effectiveFrom: number,
    afterCount: number | null,
  ) =>
    ({
      id,
      itemId: 'p2',
      kind: 'payLine',
      createdAt: 1,
      effectiveFrom,
      effectiveUntil: null,
      changeId: 'c',
      payload: {
        name: 'Gig',
        schedule: {
          kind: 'weekly',
          anchor: today - 21 * DAY_MS,
          monthDays: [],
        },
        amount: exact(10_000),
        ending: { onDate: null, afterCount },
        stanceOverride: null,
        pairings: [],
      },
    }) as unknown as OpenVersion;
  const sweepKey = (versions: OpenVersion[]) =>
    selectReachedEndingsKey(
      { runway: { items: sweepItems, versions, days: [] } } as never,
      today,
    );
  assert.notEqual(
    sweepKey([sweepVersion('s1', today - 30 * DAY_MS, 2)]),
    '',
    'a reached ending is swept',
  );
  assert.equal(
    sweepKey([
      sweepVersion('s1', today - 30 * DAY_MS, 2),
      sweepVersion('s2', today + 30 * DAY_MS, null),
    ]),
    '',
    'a scheduled later version means it has not ended',
  );

  // A stretch or an ending reaches no further than ten years ahead.
  assert.equal(
    getChangeSpan(
      {
        ...INITIAL_FROM_WHEN,
        choice: 'stretch',
        stretch: 'until',
        until: '2060-01-01',
      },
      { today, days: coming, presetDayKey: null },
    ).span,
    null,
    'a last day past the ten years the rules allow is refused',
  );
}

// Lookahead: how far the plan holds (Issue 21).
{
  const today = utc(2026, 10, 23);
  const horizon = addUtcMonths(today, 12);
  const exact = (cents: number) => ({ lowCents: cents, highCents: cents });
  const never = { onDate: null, afterCount: null };
  const emptyDraft = (lines: LookaheadDraft['draft']['lines'] = []) =>
    ({
      days: [],
      moneyCents: 0,
      lines,
      heldCents: 0,
      freeToSpend: { cents: 0, bySource: [] },
    }) as LookaheadDraft['draft'];
  const day = (on: number, key = `pay:${on}`) =>
    ({
      dayKey: key,
      payLineId: 'pay',
      sourceId: 'src',
      on,
      sourceName: 'Acme',
      payLineName: 'Paycheck',
      amount: exact(100_000),
      stanceOverride: null,
    }) as never;
  const run = (
    days: ReturnType<typeof day>[],
    over: Partial<Parameters<typeof lookahead>[0]> = {},
  ) =>
    lookahead({
      today,
      horizon,
      days,
      bills: [],
      payments: {},
      draftOf: () => ({ draft: emptyDraft(), names: {} }),
      ...over,
    });

  // Horizon edges: with no problem the plan holds to the horizon, or to the last income day when income ends.
  const weekly = Array.from({ length: 53 }, (_, i) =>
    day(today + i * 7 * DAY_MS),
  );
  assert.equal(
    run(weekly.filter((entry) => entry.on <= horizon)).holdsThrough,
    horizon,
    'a plan with nothing wrong holds to the horizon',
  );
  const endsEarly = run(weekly.slice(0, 10));
  assert.equal(endsEarly.incomeEndsOn, today + 9 * 7 * DAY_MS);
  assert.equal(
    endsEarly.holdsThrough,
    today + 9 * 7 * DAY_MS,
    'income that ends stops the plan at its last day',
  );
  assert.equal(
    run(weekly.slice(0, 51)).incomeEndsOn,
    null,
    'a last income day near the horizon is not an ending',
  );
  assert.equal(run([]).problems.length, 0);
  assert.equal(run([]).hasBills, false);

  const payment = (dueOn: number, parts: number, fundedCents = 0) =>
    ({
      dueOn,
      totalCents: 1_000,
      fundedCents,
      fundedDays: 0,
      ranged: null,
      paid: null,
      parts: Array.from({ length: parts }, () => ({
        day: day(today),
        cents: 1,
      })),
    }) as never;
  const billsOf = (...ids: string[]) =>
    ids.map((id) => ({ id, name: id, since: 0 }));

  // A bill with no income day before it is due warns, naming the bill and the date.
  const noIncome = run(weekly.slice(0, 3), {
    bills: billsOf('rent', 'car'),
    payments: {
      rent: [payment(today + 40 * DAY_MS, 0)],
      car: [payment(today + 5 * DAY_MS, 2)],
    },
  });
  assert.deepEqual(
    noIncome.problems.map((problem) => [problem.kind, problem.on]),
    [['noIncome', today + 40 * DAY_MS]],
  );
  assert.equal(
    noIncome.holdsThrough,
    today + 39 * DAY_MS,
    'the plan holds through the day before a bill with no income',
  );
  assert.equal(
    run(weekly.slice(0, 3), {
      bills: billsOf('rent'),
      payments: { rent: [payment(today + 40 * DAY_MS, 0, 1_000)] },
    }).problems.length,
    0,
    'a payment set aside in full needs no income day',
  );
  assert.equal(
    run(weekly.slice(0, 3), {
      bills: billsOf('rent'),
      payments: { rent: [payment(horizon, 0)] },
    }).problems.length,
    1,
    'a payment due on the horizon is checked',
  );
  assert.equal(
    run(weekly.slice(0, 3), {
      bills: billsOf('rent'),
      payments: { rent: [payment(horizon + DAY_MS, 0)] },
    }).problems.length,
    0,
    'a payment past the horizon is not',
  );

  // An overdue unpaid bill stops "covered" and holds through nothing; one before the bill began is ignored.
  const overdue = run(weekly.slice(0, 3), {
    bills: billsOf('rent'),
    payments: {
      rent: [payment(today - 3 * DAY_MS, 0), payment(today + 9 * DAY_MS, 2)],
    },
  });
  assert.equal(overdue.problems[0].kind, 'overdue');
  assert.equal(overdue.holdsThrough, null);
  assert.equal(
    run(weekly.slice(0, 3), {
      bills: [{ id: 'rent', name: 'rent', since: today }],
      payments: { rent: [payment(today - 3 * DAY_MS, 0)] },
    }).problems.length,
    0,
    'a due date before the bill was tracked is not overdue',
  );
  assert.equal(
    run(weekly.slice(0, 3), {
      bills: billsOf('rent'),
      payments: {
        rent: [
          {
            ...(payment(today - 3 * DAY_MS, 0) as object),
            paid: { moveId: 'm' },
          } as never,
        ],
      },
    }).problems.length,
    0,
    'a bill marked paid is not overdue',
  );

  // The walk carries what each day gave a bill into the next, and names the item that runs short.
  const seen: number[] = [];
  const line = (shortBy: number, tier: 'must' | 'want' = 'must') =>
    ({
      lineId: 'x',
      dayKey: 'x',
      itemId: 'rent',
      tier,
      bill: { dueOn: today + 3 * DAY_MS, totalCents: 1_000, ranged: null },
      cents: 400,
      shortBy,
    }) as never;
  const chained = run(
    [day(today), day(today + 7 * DAY_MS), day(today + 14 * DAY_MS)],
    {
      draftOf: (entry, carry) => {
        seen.push(
          (carry.funded.rent ?? []).reduce((sum, f) => sum + f.cents, 0),
        );
        return {
          draft: emptyDraft([line(entry.on === today + 14 * DAY_MS ? 250 : 0)]),
          names: { rent: { name: 'Rent' } },
        };
      },
    },
  );
  assert.deepEqual(
    seen,
    [0, 400, 800],
    'each day starts from what the days before set aside',
  );
  assert.equal(chained.problems.length, 1);
  assert.equal(chained.problems[0].kind, 'short');
  assert.equal(chained.problems[0].name, 'Rent');
  assert.equal(
    chained.holdsThrough,
    today + 7 * DAY_MS,
    'holds through the last income day before the first short one',
  );
  assert.equal(
    run([day(today)], {
      draftOf: () => ({ draft: emptyDraft([line(100, 'want')]), names: {} }),
    }).problems.length,
    1,
    'a bill due before the next income day that is not set aside in full is a gap, whatever its priority',
  );
  assert.equal(
    run([day(today), day(today + 2 * DAY_MS)], {
      draftOf: (entry) => ({
        draft: emptyDraft(
          entry.on === today
            ? [
                {
                  ...(line(100, 'want') as object),
                  bill: {
                    dueOn: today + 20 * DAY_MS,
                    totalCents: 1,
                    ranged: null,
                  },
                } as never,
              ]
            : [],
        ),
        names: {},
      }),
    }).problems.length,
    0,
    'a short Want bill due after the next income day is not yet a gap',
  );

  // A change that starts in two months shows early, and leaves every earlier draft alone.
  const planItems: PlanItemDoc[] = [
    item('pay', 1, { kind: 'payLine', parentId: 'src' }),
    item('src', 1),
    item('groc', 2, { kind: 'envelope' }),
  ];
  const envelope = (
    id: string,
    itemId: string,
    from: number,
    cents: number,
    until: number | null = null,
  ) =>
    ({
      id,
      itemId,
      kind: 'envelope',
      createdAt: 1,
      effectiveFrom: from,
      effectiveUntil: until,
      changeId: 'c',
      payload: {
        name: itemId,
        emoji: null,
        priority: 'must',
        orderIndex: 1,
        funding: {
          amount: { kind: 'exact', cents },
          cadence: { kind: 'everyIncomeDay' },
        },
      },
    }) as unknown as OpenVersion;
  const baseVersions: OpenVersion[] = [
    {
      id: 'vsrc',
      itemId: 'src',
      kind: 'source',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: { name: 'Acme', pairings: [] },
    } as unknown as OpenVersion,
    {
      id: 'vpay',
      itemId: 'pay',
      kind: 'payLine',
      createdAt: 1,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: {
        name: 'Paycheck',
        schedule: { kind: 'weekly', anchor: today, monthDays: [] },
        amount: exact(100_000),
        ending: never,
        stanceOverride: null,
        pairings: [],
      },
    } as unknown as OpenVersion,
    envelope('vg', 'groc', today, 90_000),
  ];
  const lookaheadOf = (
    items: PlanItemDoc[],
    versions: OpenVersion[],
    billProgress: Record<string, never> = {},
  ) => {
    const comingDays = buildComingDays(items, versions, today);
    const bills = items
      .filter((entry) => entry.kind === 'bill')
      .map((entry) => ({
        item: entry,
        version: versions.find((v) => v.itemId === entry.id) as never,
      })) as never[];
    const payments = Object.fromEntries(
      bills.map(({ item: entry, version: v }: never) => {
        const payload = (v as { payload: never }).payload as {
          priority: 'must';
          orderIndex: number;
          amount: { lowCents: number; highCents: number };
          timing: { schedule: never };
          ending: typeof never;
          fundedBy: { kind: 'suggested' };
        };
        return [
          (entry as PlanItemDoc).id,
          planBillPayments(
            {
              itemId: (entry as PlanItemDoc).id,
              createdAt: 1,
              priority: payload.priority,
              orderIndex: payload.orderIndex,
              amount: payload.amount,
              schedule: payload.timing.schedule,
              ending: payload.ending,
              fundedBy: payload.fundedBy,
              progress: billProgress[(entry as PlanItemDoc).id],
            },
            comingDays,
            horizon,
            'conservative',
          ),
        ];
      }),
    );
    return computeLookahead(
      { items, versions, openDays: [] },
      {
        stance: 'conservative',
        today,
        heldByItem: {},
        settledKey: '',
        billProgress,
        startDate: null,
        comingDays,
        bills: bills.map(({ item: entry, version: v }: never) => ({
          item: entry,
          version: v,
        })) as never,
        payments,
      },
    );
  };
  const steady = lookaheadOf(planItems, baseVersions);
  assert.equal(steady.problems.length, 0);
  assert.equal(
    steady.holdsThrough,
    horizon,
    'a steady plan holds to the horizon',
  );
  const raiseOn = today + 60 * DAY_MS;
  const raised = lookaheadOf(planItems, [
    envelope('vg', 'groc', today, 90_000, raiseOn - DAY_MS),
    envelope('vg2', 'groc', raiseOn, 120_000),
    ...baseVersions.filter((entry) => entry.kind !== 'envelope'),
  ]);
  assert.equal(
    raised.problems.length > 0,
    true,
    'a change in two months shows now',
  );
  assert.equal(raised.problems[0].kind, 'short');
  assert.equal(
    raised.problems[0].on >= raiseOn,
    true,
    'and starts on or after its date',
  );
  assert.equal(
    raised.holdsThrough !== null && raised.holdsThrough < raiseOn,
    true,
    'the plan holds through the income day before it',
  );
  assert.equal(
    Object.keys(raised.shortByDay).every((key) =>
      raised.problems.some(
        (problem) =>
          problem.on >= raiseOn &&
          'dayKey' in problem &&
          problem.dayKey === key,
      ),
    ),
    true,
  );
  const draftOnDay = (versions: OpenVersion[], dayKey: string) =>
    computeDraftView(
      planItems,
      versions,
      'conservative',
      [],
      dayKey,
      today,
      {},
      '',
      {},
    )?.draft;
  const allDays = buildComingDays(planItems, baseVersions, today);
  const before = allDays.filter((entry) => entry.on < raiseOn).at(-1);
  assert.deepEqual(
    draftOnDay(
      [
        envelope('vg', 'groc', today, 90_000, raiseOn - DAY_MS),
        envelope('vg2', 'groc', raiseOn, 120_000),
        ...baseVersions.filter((entry) => entry.kind !== 'envelope'),
      ],
      before?.dayKey ?? '',
    ),
    draftOnDay(baseVersions, before?.dayKey ?? ''),
    'a draft before the change date is the same with or without it',
  );

  // A bill due the 5th with income on the 1st and 8th: the 1st funds it, so there is no warning; with only the 8th there is.
  const rentVersion = (anchor: number) =>
    ({
      id: 'vrent',
      itemId: 'rent',
      kind: 'bill',
      createdAt: 4,
      effectiveFrom: today,
      effectiveUntil: null,
      changeId: 'c',
      payload: {
        name: 'Rent',
        emoji: null,
        priority: 'must',
        orderIndex: 1,
        amount: exact(50_000),
        timing: {
          kind: 'date',
          schedule: { kind: 'once', anchor, monthDays: [] },
        },
        ending: { onDate: null, afterCount: 1 },
        fundedBy: { kind: 'suggested' },
        stanceOverride: null,
      },
    }) as unknown as OpenVersion;
  const twiceMonthly = (monthDays: number[]) =>
    ({
      ...(baseVersions[1] as object),
      payload: {
        ...(baseVersions[1] as unknown as { payload: object }).payload,
        schedule: { kind: 'twiceMonthly', anchor: today, monthDays },
      },
    }) as unknown as OpenVersion;
  const rentItems = [...planItems, item('rent', 4, { kind: 'bill' })];
  const nov5 = utc(2026, 11, 5);
  const withFirst = lookaheadOf(rentItems, [
    baseVersions[0],
    twiceMonthly([1, 8]),
    baseVersions[2],
    rentVersion(nov5),
  ]);
  assert.equal(
    withFirst.problems.some((problem) => problem.kind === 'noIncome'),
    false,
    'the 1st can fund a bill due the 5th',
  );
  const onlyEighth = lookaheadOf(rentItems, [
    baseVersions[0],
    twiceMonthly([8]),
    baseVersions[2],
    rentVersion(utc(2026, 11, 5)),
  ]);
  assert.equal(
    onlyEighth.problems.some(
      (problem) => problem.kind === 'noIncome' && problem.on === nov5,
    ),
    true,
    'with income only on the 8th, nothing before the 5th can fund it',
  );

  // The stance cushion adds the difference between the planned figure and the middle of each range.
  const rangeDay = (on: number, low: number, high: number, sourceId: string) =>
    ({
      ...(day(on) as object),
      sourceId,
      amount: { lowCents: low, highCents: high },
    }) as never;
  const cushion = getStanceCushion(
    'conservative',
    today,
    [
      rangeDay(today + 3 * DAY_MS, 100_000, 120_000, 's1'),
      rangeDay(today + 5 * DAY_MS, 50_000, 60_000, 's2'),
      rangeDay(today + 90 * DAY_MS, 50_000, 60_000, 's3'),
    ],
    {
      b1: [
        {
          dueOn: today + 4 * DAY_MS,
          totalCents: 20_000,
          ranged: {
            range: { lowCents: 10_000, highCents: 20_000 },
            stance: 'conservative',
            isOwnStance: false,
          },
          paid: null,
        },
      ] as never,
    },
  );
  assert.deepEqual(cushion, {
    cents: 10_000 + 5_000 + 5_000,
    sourceCount: 2,
    billCount: 1,
  });
  assert.equal(
    getStanceCushion('middle', today, [rangeDay(today, 1, 3, 's')], {}),
    null,
    'a middle stance holds nothing back',
  );

  // 50 envelopes and 10 bills over a year of weekly income.
  const manyItems: PlanItemDoc[] = [
    ...planItems.filter((entry) => entry.kind !== 'envelope'),
    ...Array.from({ length: 50 }, (_, i) =>
      item(`e${i}`, i + 2, { kind: 'envelope' }),
    ),
  ];
  const manyVersions: OpenVersion[] = [
    ...baseVersions.filter((entry) => entry.kind !== 'envelope'),
    ...Array.from({ length: 50 }, (_, i) =>
      envelope(`ve${i}`, `e${i}`, today, 1_000 + i),
    ),
  ];
  const timings = Array.from({ length: 5 }, () => {
    const started = performance.now();
    lookaheadOf(manyItems, manyVersions);
    return performance.now() - started;
  }).sort((a, b) => a - b);
  assert.ok(timings[2] < 1_500, `50-envelope lookahead median ${timings[2]}ms`);
  console.log(
    `runway engine: 50-envelope lookahead over ${buildComingDays(manyItems, manyVersions, today).length} days median ${timings[2].toFixed(0)} ms, worst ${timings[4].toFixed(0)} ms`,
  );

  const fiveYearsAgo = today - 1_826 * DAY_MS;
  const longBills = Array.from({ length: 60 }, (_, i) =>
    item(`lb${i}`, fiveYearsAgo + i, { kind: 'bill' }),
  );
  const longBillVersions = longBills.map(
    (entry, i) =>
      ({
        id: `v${entry.id}`,
        itemId: entry.id,
        kind: 'bill',
        createdAt: fiveYearsAgo + i,
        effectiveFrom: fiveYearsAgo,
        effectiveUntil: null,
        changeId: 'c',
        payload: {
          name: `Bill ${i}`,
          emoji: null,
          priority: 'must',
          orderIndex: i,
          amount: exact(1_500 + i * 700),
          timing: {
            kind: 'date',
            schedule: {
              kind: 'monthly',
              anchor: utc(2021, 10, 1 + (i % 28)),
              monthDays: [1 + (i % 28)],
            },
          },
          ending: never,
          fundedBy: { kind: 'suggested' },
          stanceOverride: null,
        },
      }) as unknown as OpenVersion,
  );
  const longItems = [...manyItems, ...longBills];
  const longVersions = [...manyVersions, ...longBillVersions];
  const longTimings = Array.from({ length: 3 }, () => {
    const started = performance.now();
    lookaheadOf(longItems, longVersions);
    return performance.now() - started;
  }).sort((a, b) => a - b);
  assert.ok(
    longTimings[1] < 250,
    `50 envelopes and 60 bills of five years: lookahead median ${longTimings[1]}ms`,
  );
  console.log(
    `runway engine: 50 envelopes and 60 five-year bills, lookahead over ${buildComingDays(longItems, longVersions, today).length} days median ${longTimings[1].toFixed(0)} ms, worst ${longTimings[2].toFixed(0)} ms`,
  );

  const longDays = buildComingDays(longItems, longVersions, today);
  const referencePayments = (
    bill: Parameters<typeof planBillPayments>[0],
    days: typeof longDays,
  ) => {
    const dues = occurrences(
      bill.schedule,
      bill.ending,
      bill.schedule.anchor ?? 0,
      horizon,
    );
    return dues.map((dueOn, index) => {
      const previous = index === 0 ? -Infinity : dues[index - 1];
      const window = days.filter(
        (entry) => entry.on > previous && entry.on <= dueOn,
      );
      const total = bill.amount.highCents;
      const share = window.length === 0 ? 0 : Math.ceil(total / window.length);
      return { dueOn, window: window.map((entry) => entry.dayKey), share };
    });
  };
  const sample = longBillVersions.slice(0, 12).map((entry) => {
    const payload = (entry as unknown as { payload: never }).payload as {
      priority: 'must';
      orderIndex: number;
      amount: { lowCents: number; highCents: number };
      timing: { schedule: never };
    };
    return {
      itemId: entry.itemId,
      createdAt: 1,
      priority: payload.priority,
      orderIndex: payload.orderIndex,
      amount: payload.amount,
      schedule: payload.timing.schedule,
      ending: never,
      fundedBy: { kind: 'suggested' as const },
    };
  });
  sample.forEach((bill) => {
    const planned = planBillPayments(bill, longDays, horizon).map(
      (payment) => ({
        dueOn: payment.dueOn,
        window: payment.parts.map((part) => part.day.dayKey),
        share: payment.parts[0]?.cents ?? 0,
      }),
    );
    const expected = referencePayments(bill, longDays);
    assert.deepEqual(
      planned.map(({ dueOn, window }) => ({ dueOn, window })),
      expected.map(({ dueOn, window }) => ({ dueOn, window })),
      'each payment is funded by the income days after the previous one through its due date, however far back the bill began',
    );
    assert.deepEqual(
      planned.map((entry) => entry.share),
      expected.map((entry) => entry.share),
      'and the first day of a window takes its ceiling share',
    );
  });
  sample.forEach((bill) => {
    const funded = (payments: ReturnType<typeof planBillPayments>) =>
      payments.filter((payment) => payment.parts.length > 0);
    assert.deepEqual(
      funded(
        planBillPayments(bill, longDays, horizon, 'conservative', {
          firstDayOn: longDays[0].on,
        }),
      ),
      funded(planBillPayments(bill, longDays, horizon)),
      'starting at the first income day leaves every funded payment as it was',
    );
  });
  const shuffled = [...longDays].reverse();
  assert.deepEqual(
    planBillPayments(sample[0], shuffled, horizon).map(
      (payment) => payment.parts.length,
    ),
    planBillPayments(sample[0], longDays, horizon).map(
      (payment) => payment.parts.length,
    ),
    'days given in another order fund the same windows',
  );
}

{
  // Tracking: moving up and down repeatedly leaves one period per stretch and never overlaps.
  const day = (n: number) => Date.UTC(2026, 0, 1) + n * 86_400_000;
  assert.equal(getLevel([]), 'plan', 'a plan with no periods is at Plan');
  const up = startTrackingPeriod([], day(0));
  assert.ok('periods' in up);
  assert.equal(getLevel(up.periods), 'track');
  assert.ok(
    'error' in startTrackingPeriod(up.periods, day(1)),
    'a stale second move up is refused',
  );
  assert.ok(
    'error' in stopTrackingPeriod([], day(1)),
    'a stale move down is refused',
  );
  assert.ok(
    'error' in stopTrackingPeriod(up.periods, day(-1)),
    'tracking cannot stop before it started',
  );
  const down = stopTrackingPeriod(up.periods, day(10));
  assert.ok('periods' in down);
  assert.equal(getLevel(down.periods), 'plan');
  assert.equal(getEarliestTrackingStart(down.periods), day(11));
  assert.ok(
    'error' in startTrackingPeriod(down.periods, day(10)),
    'the day tracking stopped is not in a new period',
  );
  const again = startTrackingPeriod(down.periods, day(11));
  assert.ok('periods' in again);
  const loop = Array.from({ length: 6 }).reduce<{
    day: number;
    periods: { from: number; to: number | null }[];
  }>(
    (state) => {
      const opened = startTrackingPeriod(state.periods, state.day);
      assert.ok('periods' in opened);
      const closed = stopTrackingPeriod(
        opened.periods,
        state.day + 3 * 86_400_000,
      );
      assert.ok('periods' in closed);
      return { day: state.day + 4 * 86_400_000, periods: closed.periods };
    },
    { day: day(0), periods: [] },
  );
  assert.equal(loop.periods.length, 6, 'one period per stretch');
  assert.ok(
    loop.periods.every(
      (period, index) =>
        period.to !== null &&
        period.from <= period.to &&
        (index === 0 || period.from > (loop.periods[index - 1].to ?? 0)),
    ),
    'periods never overlap',
  );
  {
    // Starting tracking on a day money arrived or a bill was paid counts neither twice.
    const d = (n: number) => Date.UTC(2026, 9, 1) + n * 86_400_000;
    const move = (
      kind: 'start' | 'billPaid',
      refId: string | null,
      amountCents: number,
      createdAt: number,
      payload: object = {},
    ) =>
      ({
        id: `${kind}_${refId}_${createdAt}`,
        kind,
        date: d(0),
        refId,
        reversesMoveId: null,
        createdAt,
        payload: { amountCents, holding: 'envelope', ...payload },
      }) as unknown as OpenMove;
    const record = {
      id: 'r',
      dayId: 'day1',
      kind: 'confirmed',
      createdAt: 1,
      payload: {
        arrivedCents: 100_000,
        lines: [{ itemId: 'g', cents: 30_000 }],
      },
    } as unknown as OpenRecord;
    const input = {
      startDate: d(0),
      moves: [move('start', null, 100_000, 1), move('start', 'g', 0, 1)],
      records: [record],
      arrivedOn: new Map([['day1', d(19)]]),
      kinds: { g: 'envelope' as const },
    };
    const now = deriveBalances(input);
    assert.equal(now.moneyOnHandCents, 200_000);
    const before = deriveBalancesBefore(input, d(19));
    assert.equal(
      before.moneyOnHandCents,
      100_000,
      'a day that arrives on the start day is not in the base',
    );
    assert.equal(before.assignedByItem.g, 0);
    const tracked = deriveBalances({
      ...input,
      startDate: d(19),
      moves: [
        ...input.moves,
        move('start', null, before.moneyOnHandCents, 2),
        move('start', 'g', before.assignedByItem.g, 2),
      ].map((m, i) => (i >= 2 ? { ...m, date: d(19) } : m)),
    });
    assert.equal(
      tracked.moneyOnHandCents,
      now.moneyOnHandCents,
      "starting tracking today keeps today's figures",
    );
    assert.equal(tracked.assignedByItem.g, now.assignedByItem.g);
    assert.equal(
      deriveBalancesBefore(input, d(20)).moneyOnHandCents,
      200_000,
      'a later start keeps what arrived before it',
    );
  }
  assert.equal(getLevelWords('plan').envelopeFigure, 'assigned');
  assert.equal(getLevelWords('track').envelopeFigure, 'left');
}

// Purchases (Issue 24): left and over, the split and the refund.
{
  const start = Date.UTC(2026, 9, 1);
  const day = (n: number) => start + n * 86_400_000;
  const startMove = (
    id: string,
    refId: string | null,
    cents: number,
    holding: 'money' | 'envelope',
  ) =>
    ({
      id,
      kind: 'start',
      date: start,
      refId,
      reversesMoveId: null,
      createdAt: 1,
      payload: { amountCents: cents, holding },
    }) as unknown as OpenMove;
  const purchase = (
    id: string,
    on: number,
    lines: { envelopeId: string | null; cents: number }[],
    refundOfId: string | null = null,
  ): OpenPurchase => {
    const chosen = toChosenLines(lines);
    return {
      id,
      date: on,
      source: 'manual',
      needsHome: false,
      createdAt: on,
      updatedAt: on,
      amountCents: sumLines(chosen),
      merchant: null,
      note: null,
      lines: chosen,
      refundOfId,
    };
  };
  const base = {
    startDate: start,
    moves: [
      startMove('m', null, 100_000, 'money'),
      startMove('f', 'food', 10_000, 'envelope'),
      startMove('g', 'gifts', 5_000, 'envelope'),
    ],
    records: [],
    arrivedOn: new Map<string, number>(),
    kinds: { food: 'envelope', gifts: 'envelope' } as const,
  };
  const before = deriveBalances(base);
  assert.equal(before.assignedByItem.food, 10_000);
  assert.equal(before.freeToSpendCents, 85_000);

  const over = deriveBalances({
    ...base,
    purchases: [
      purchase('p1', day(1), [{ envelopeId: 'food', cents: 12_000 }]),
    ],
  });
  assert.equal(
    over.assignedByItem.food,
    -2_000,
    '$120 against $100 left is $20 over',
  );
  assert.deepEqual(describeEnvelopeFigure('track', over.assignedByItem.food), {
    value: '\u2212$20.00',
    word: 'over',
  });
  assert.deepEqual(describeEnvelopeFigure('track', 3_100), {
    value: '$31.00',
    word: 'left',
  });
  assert.equal(describeEnvelopeFigure('plan', 10_000).word, 'assigned');
  assert.equal(
    over.freeToSpendCents,
    before.freeToSpendCents - 2_000,
    'Free to spend falls by exactly the overspend',
  );
  assert.equal(over.spentCents, 12_000);
  assert.equal(
    over.assignedToEnvelopesCents,
    5_000,
    'an envelope that is over holds nothing',
  );

  const within = deriveBalances({
    ...base,
    purchases: [purchase('p2', day(1), [{ envelopeId: 'food', cents: 4_000 }])],
  });
  assert.equal(within.assignedByItem.food, 6_000);
  assert.equal(
    within.freeToSpendCents,
    before.freeToSpendCents,
    'spending inside an envelope leaves Free to spend alone',
  );

  const overAgain = deriveBalances({
    ...base,
    purchases: [
      purchase('p1', day(1), [{ envelopeId: 'food', cents: 12_000 }]),
      purchase('p3', day(2), [{ envelopeId: 'food', cents: 500 }]),
    ],
  });
  assert.equal(overAgain.assignedByItem.food, -2_500);
  assert.equal(
    overAgain.freeToSpendCents,
    before.freeToSpendCents - 2_500,
    'spending from an envelope that is already over draws Free to spend by all of it',
  );

  const refunded = deriveBalances({
    ...base,
    purchases: [
      purchase('p1', day(1), [{ envelopeId: 'food', cents: 12_000 }]),
      purchase('r1', day(2), [{ envelopeId: 'food', cents: -3_000 }], 'p1'),
    ],
  });
  assert.equal(refunded.assignedByItem.food, 1_000);
  assert.equal(
    refunded.freeToSpendCents,
    before.freeToSpendCents,
    'a refund after an overspend restores Free to spend with no extra step',
  );

  const toFree = deriveBalances({
    ...base,
    purchases: [purchase('r2', day(1), [{ envelopeId: null, cents: -2_000 }])],
  });
  assert.equal(toFree.freeToSpendCents, before.freeToSpendCents + 2_000);
  assert.equal(toFree.assignedByItem.food, 10_000);

  const early = purchase('p0', start - 86_400_000, [
    { envelopeId: 'food', cents: 9_000 },
  ]);
  assert.equal(
    deriveBalances({ ...base, purchases: [early] }).assignedByItem.food,
    10_000,
    'a purchase from before the starting point is not counted',
  );
  assert.equal(
    deriveBalancesBefore(
      {
        ...base,
        purchases: [
          purchase('p4', day(3), [{ envelopeId: 'food', cents: 1_000 }]),
        ],
      },
      day(3),
    ).assignedByItem.food,
    10_000,
    'figures as of a day leave out purchases from that day on',
  );

  const effect = getLineEffect(10_000, 12_000);
  assert.deepEqual(effect, {
    afterCents: -2_000,
    overCents: 2_000,
    freeDropCents: 2_000,
  });
  assert.deepEqual(getLineEffect(-1_000, 500), {
    afterCents: -1_500,
    overCents: 1_500,
    freeDropCents: 500,
  });
  assert.equal(getLineEffect(5_000, 3_000).freeDropCents, 0);
  assert.equal(getLineEffect(-2_000, -3_000).freeDropCents, -2_000);
  assert.deepEqual(
    getPurchaseEffect(
      toChosenLines([
        { envelopeId: 'food', cents: 12_000 },
        { envelopeId: 'gifts', cents: 1_000 },
      ]),
      { food: 10_000, gifts: 5_000 },
    ),
    { freeDropCents: 2_000, over: [{ envelopeId: 'food', overCents: 2_000 }] },
  );

  assert.equal(
    getPurchaseEffect(toChosenLines([{ envelopeId: null, cents: -500 }]), {})
      .freeDropCents,
    -500,
    'a refund to Free to spend raises it by all of it',
  );
  assert.equal(
    getPurchaseEffect(toChosenLines([{ envelopeId: null, cents: 700 }]), {})
      .freeDropCents,
    700,
  );

  assert.deepEqual(splitEvenly(10_000, ['a', 'b', 'c']), [3_334, 3_333, 3_333]);
  assert.deepEqual(
    splitEvenly(10_000, ['c', 'a', 'b']),
    [3_333, 3_334, 3_333],
    'the odd cent goes to the lowest id, not the first row',
  );
  assert.equal(
    splitEvenly(10_000, ['a', 'b', 'c']).reduce((a, b) => a + b, 0),
    10_000,
  );
  assert.deepEqual(splitEvenly(1, ['a', 'b']), [1, 0]);
  assert.deepEqual(
    splitEvenly(-10_000, ['a', 'b', 'c']),
    [-3_334, -3_333, -3_333],
  );

  const target = purchase('t', day(1), [
    { envelopeId: 'food', cents: 6_000 },
    { envelopeId: 'gifts', cents: 4_000 },
  ]);
  const everyone = () => true;
  const back = getRefundLines(2_000, target, everyone);
  assert.deepEqual(
    back.kind === 'lines' ? back.lines.map((l) => l.cents) : null,
    [-1_200, -800],
  );
  const odd = purchase('o', day(1), [
    { envelopeId: 'a', cents: 3_334 },
    { envelopeId: 'b', cents: 3_333 },
    { envelopeId: 'c', cents: 3_333 },
  ]);
  const oddBack = getRefundLines(5_001, odd, everyone);
  assert.equal(oddBack.kind, 'lines');
  assert.equal(
    oddBack.kind === 'lines' ? sumLines(oddBack.lines) : 0,
    -5_001,
    'a split refund returns exactly the amount refunded',
  );
  assert.equal(
    getRefundLines(2_000, target, (id) => id !== 'gifts').kind,
    'pick',
    'a refund of a purchase from an archived envelope asks where it goes',
  );
  assert.equal(
    getRefundLines(
      2_000,
      purchase('n', day(1), [{ envelopeId: null, cents: 0 }]),
      everyone,
    ).kind,
    'pick',
    'a purchase with no envelope lines asks where the refund goes',
  );
  assert.equal(
    getRefundableCents(target, [
      target,
      purchase(
        'r',
        day(2),
        [
          { envelopeId: 'food', cents: -1_200 },
          { envelopeId: 'gifts', cents: -800 },
        ],
        't',
      ),
    ]),
    8_000,
    'refunds already made come off what can still be refunded',
  );

  {
    // Many small refunds follow what each envelope still has to get back, never one envelope's share twice.
    const pair = purchase('pair', day(1), [
      { envelopeId: 'a', cents: 1 },
      { envelopeId: 'b', cents: 1 },
    ]);
    const first = getRefundLines(1, pair, everyone, [pair]);
    assert.deepEqual(
      first.kind === 'lines'
        ? first.lines.map((l) => [l.envelopeId, l.cents])
        : null,
      [['a', -1]],
    );
    const second = getRefundLines(1, pair, everyone, [
      pair,
      purchase('r1', day(2), first.kind === 'lines' ? first.lines : [], 'pair'),
    ]);
    assert.deepEqual(
      second.kind === 'lines'
        ? second.lines.map((l) => [l.envelopeId, l.cents])
        : null,
      [['b', -1]],
      'the second cent goes to the envelope that has had nothing back',
    );
  }

  const periods = [
    { from: day(0), to: day(9) },
    { from: day(20), to: null },
  ];
  assert.equal(
    getCountedFrom(periods),
    day(20),
    'figures count from the open stretch',
  );
  assert.equal(getCountedFrom([{ from: day(0), to: day(9) }]), null);
  assert.equal(isInTrackingPeriods(periods, day(9)), true);
  assert.equal(isInTrackingPeriods(periods, day(10)), false);
  assert.equal(isInTrackingPeriods(periods, day(40)), true);
  assert.equal(isInTrackingPeriods([], day(1)), false);
}

{
  const envelopes = [
    { id: 'dining', priority: 'should' as const, leftCents: 3_000 },
    { id: 'fun', priority: 'want' as const, leftCents: 1_000 },
    { id: 'gifts', priority: 'want' as const, leftCents: 500 },
    { id: 'rent', priority: 'must' as const, leftCents: 90_000 },
    { id: 'empty', priority: 'want' as const, leftCents: 0 },
    { id: 'over', priority: 'want' as const, leftCents: -400 },
  ];
  assert.deepEqual(checkAmount('dining', 1_200, envelopes), {
    kind: 'fits',
    leftAfterCents: 1_800,
  });
  assert.deepEqual(checkAmount('dining', 3_000, envelopes), {
    kind: 'fits',
    leftAfterCents: 0,
  });
  assert.deepEqual(
    checkAmount('dining', 4_200, envelopes),
    {
      kind: 'over',
      overCents: 1_200,
      sources: [
        { envelopeId: 'fun', takeCents: 1_000, leftAfterCents: 0 },
        { envelopeId: 'gifts', takeCents: 200, leftAfterCents: 300 },
      ],
      uncoveredCents: 0,
    },
    'lowest priority first, in list order, taking only what covers it',
  );
  const big = checkAmount('dining', 200_000, envelopes);
  assert.equal(big.kind, 'over');
  if (big.kind === 'over') {
    assert.deepEqual(
      big.sources.map((source) => source.envelopeId),
      ['fun', 'gifts', 'rent'],
      'an empty or over envelope is never a source, a Must comes last',
    );
    assert.equal(
      big.sources.reduce((sum, source) => sum + source.takeCents, 0) +
        big.uncoveredCents,
      big.overCents,
      'what the sources give and what is left over add up to the overage',
    );
  }
  const alreadyOver = checkAmount('over', 100, envelopes);
  assert.equal(alreadyOver.kind === 'over' && alreadyOver.overCents, 500);
  const words = describeAmountCheck(
    checkAmount('dining', 4_200, envelopes),
    'Dining',
    (id) => id,
  );
  assert.equal(words.headline, 'Dining would be $12.00 over.');
  assert.equal(words.sources[0], 'fun could give $10.00, leaving $0.00.');

  const dayMs = 86_400_000;
  const before = {
    id: 'p',
    date: dayMs,
    source: 'manual' as const,
    needsHome: false,
    createdAt: 1,
    updatedAt: 1,
    amountCents: 4_000,
    merchant: 'Safeway',
    note: null,
    refundOfId: null,
    lines: [{ envelopeId: 'dining', cents: 4_000, via: 'chosen' as const }],
  };
  assert.equal(
    describePurchaseEdit(
      before,
      {
        ...before,
        amountCents: 5_500,
        lines: [{ envelopeId: 'dining', cents: 5_500, via: 'chosen' }],
      },
      (id) => id,
    ),
    'Purchase changed: Safeway, amount $40.00 to $55.00.',
  );
  assert.match(
    describePurchaseRemoval(before, (id) => id),
    /^Purchase removed: Safeway, \$40\.00 on /,
  );
}

{
  // A sealed reader opens each payload once, so a snapshot that changes one document opens one.
  const encryption = {
    appId: 'runway' as const,
    keyId: 'check',
    keyVersion: 1,
    key: 'ab'.repeat(32),
  };
  const first = await sealJson({ name: 'Rent' }, encryption);
  const second = await sealJson({ name: 'Rent' }, encryption);
  const read = createSealedReader(encryption);
  const [again, once, other] = await Promise.all([
    read<{ name: string }>(first),
    read<{ name: string }>(first),
    read<{ name: string }>(second),
  ]);
  assert.equal(again, once, 'the same sealed payload is opened once');
  assert.notEqual(again, other, 'a payload sealed again is opened on its own');
  assert.equal(other.name, 'Rent');
}

console.log('runway engine: ok');
