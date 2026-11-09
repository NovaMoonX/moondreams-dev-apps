// Pure checks for Runway version timelines: goals, monthly totals and bill payments read each day's own version.
import assert from 'node:assert/strict';

import {
  getGoalPaceStretches as getGoalPaceStretchesTl,
  getGoalStretches as getGoalStretchesTl,
} from '../../src/apps/runway/engine/goalTimeline.ts';
import {
  getTimelinePace as getTimelinePaceTl,
  getTimelineTrack as getTimelineTrackTl,
  planGoalTimeline as planGoalTimelineTl,
} from '../../src/apps/runway/engine/pace.ts';
import { toPaceStretches as toPaceStretchesTl } from '../../src/apps/runway/engine/goalTimeline.ts';
import { monthlyTotal as monthlyTotalTl } from '../../src/apps/runway/engine/groups.ts';
import { getGoalBalanceAt as getGoalBalanceAtTl } from '../../src/apps/runway/engine/horizonGoal.ts';
import { selectBills as selectBillsTl } from '../../src/apps/runway/store/selectors/runwaySelectors.ts';
import {
  selectUsualMonthPlan as selectUsualMonthPlanTl,
  toBillMember as toBillMemberTl,
} from '../../src/apps/runway/store/selectors/usualMonthSelectors.ts';

import type { GoalSealed } from '../../src/apps/runway/types.ts';
import type { ComingDay } from '../../src/apps/runway/engine/comingDays.ts';
import type { Lookahead } from '../../src/apps/runway/engine/lookahead.ts';
import { previewBillShareView } from '../../src/apps/runway/store/selectors/previewSelectors.ts';
import {
  computeDraftView,
  selectBillPayments,
} from '../../src/apps/runway/store/selectors/runwaySelectors.ts';
import { runwayReducer } from '../../src/apps/runway/store/runwaySlice.ts';
import { getStretchesOf } from '../../src/apps/runway/engine/billStretches.ts';

import { buildComingDays } from '../../src/apps/runway/engine/comingDays.ts';
import { DAY_MS, toDayKey } from '../../src/apps/runway/engine/dates.ts';
import { planBillPayments } from '../../src/apps/runway/engine/demands.ts';
import { computeLookahead } from '../../src/apps/runway/store/selectors/lookaheadSelectors.ts';
import type {
  Ending,
  OpenVersion,
  PlanItemDoc,
  Schedule,
} from '../../src/apps/runway/types.ts';

const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);
const NEVER: Ending = { onDate: null, afterCount: null };
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
  heldReleasedOn: null,
  ...over,
});

// Goals and monthly totals read the version in force on each day, not today's.
{
  const D = 86_400_000;
  const t0 = Date.UTC(2027, 0, 1);
  const pays = Array.from({ length: 12 }, (_, i) => ({
    dayKey: `p${i}`,
    on: t0 + (i + 1) * 14 * D,
  }));
  const fund = (cents: number, kind = 'everyIncomeDay') =>
    ({
      amount: { kind: 'exact', cents },
      cadence: { kind },
    }) as unknown as GoalSealed['funding'];
  const goalPayload = (over: Partial<GoalSealed> = {}) =>
    ({
      name: 'G',
      emoji: null,
      priority: 'should',
      orderIndex: 1,
      targetCents: 120_000,
      targetDate: t0 + 170 * D,
      funding: fund(30_000),
      state: 'active',
      groupId: null,
      ...over,
    }) as GoalSealed;
  const goalVersion = (
    id: string,
    payload: GoalSealed,
    from: number,
    until: number | null = null,
    createdAt = 1,
  ) => ({
    id,
    kind: 'goal',
    itemId: 'g',
    createdAt,
    effectiveFrom: from,
    effectiveUntil: until,
    payload,
  });
  const goalHeader = (over: Record<string, number | null> = {}) => ({
    id: 'g',
    endedAt: null,
    archivedAt: null,
    ...over,
  });
  const base = goalVersion('v1', goalPayload(), t0 - 100 * D);
  const read = (
    versions: ReturnType<typeof goalVersion>[],
    header = goalHeader(),
  ) => {
    const stretches = getGoalStretchesTl(versions, header, t0);
    return {
      stretches,
      pace: getTimelinePaceTl(toPaceStretchesTl(stretches), 0, pays),
    };
  };

  const same = read([base]);
  assert.equal(same.pace.reachedOn?.dayKey, 'p3', 'one version: $300 a pay');

  const halved = read([
    base,
    goalVersion(
      'v2',
      goalPayload({ funding: fund(15_000) }),
      t0 + 28 * D,
      null,
      2,
    ),
  ]);
  assert.equal(
    halved.pace.reachedOn?.dayKey,
    'p6',
    '$300 then $150 from the second pay: the finish date follows the change',
  );

  const stopped = read([
    base,
    goalVersion('v2', goalPayload({ state: 'paused' }), t0 + 31 * D, null, 2),
  ]);
  assert.equal(
    stopped.pace.plannedByDateCents,
    60_000,
    'pays after the stop count nothing',
  );
  assert.equal(stopped.pace.reachedOn, null, 'a stopped goal does not finish');
  assert.equal(stopped.pace.state, 'behind');
  assert.equal(
    getTimelineTrackTl(stopped.pace),
    'behind',
    'it is behind, not unjudged',
  );

  const later = read([
    goalVersion(
      'v1',
      goalPayload({ funding: fund(30_000, 'none') }),
      t0 - 100 * D,
      t0 + 60 * D,
    ),
    goalVersion('v2', goalPayload(), t0 + 60 * D),
  ]);
  assert.equal(
    later.pace.reachedOn?.dayKey,
    'p7',
    'a goal that starts later saves from its start',
  );
  assert.notEqual(later.pace.state, null, 'and has a pace');
  assert.notEqual(getTimelineTrackTl(later.pace), null, 'and a track');
  assert.equal(
    later.pace.dayCount,
    pays.filter((pay) => pay.on >= t0 + 60 * D && pay.on <= t0 + 170 * D)
      .length,
    'the days it needs are counted from its start',
  );

  const retargeted = read([
    base,
    goalVersion(
      'v2',
      goalPayload({ targetCents: 60_000, targetDate: t0 + 100 * D }),
      t0 + 28 * D,
      null,
      2,
    ),
  ]);
  assert.equal(
    retargeted.pace.targetDate,
    t0 + 100 * D,
    'judged against the date in force at the end',
  );
  assert.equal(
    retargeted.pace.remainingCents,
    60_000,
    'and the target in force at the end',
  );
  assert.equal(retargeted.pace.reachedOn?.dayKey, 'p1');
  assert.equal(retargeted.pace.state, 'ahead');

  const resumed = read([
    goalVersion('v1', goalPayload(), t0 - 100 * D, t0 + 31 * D),
    goalVersion(
      'v2',
      goalPayload({ state: 'paused' }),
      t0 + 31 * D,
      t0 + 60 * D,
      2,
    ),
    goalVersion('v3', goalPayload(), t0 + 60 * D, null, 3),
  ]);
  assert.equal(
    resumed.pace.reachedOn?.dayKey,
    'p5',
    'paid before the pause, nothing while paused, saving again from the resume',
  );
  assert.equal(
    planGoalTimelineTl(toPaceStretchesTl(resumed.stretches), 0, pays)
      .contributions.length,
    4,
    'the two paused pays put in nothing',
  );
  assert.notEqual(resumed.pace.state, 'behind');

  const ending = read(
    [base],
    goalHeader({ endedAt: t0 + 40 * D, archivedAt: null }),
  );
  assert.equal(
    ending.pace.plannedByDateCents,
    60_000,
    'a goal that ends before its date saves nothing after its last day',
  );
  assert.equal(ending.pace.reachedOn, null);
  assert.equal(ending.pace.state, 'behind', 'and reads behind');

  const endedBefore = read([base], goalHeader({ endedAt: t0 - 5 * D }));
  assert.equal(
    endedBefore.stretches.length,
    0,
    'a goal ended before today has none',
  );
  assert.equal(
    getGoalPaceStretchesTl([base], goalHeader({ endedAt: t0 - 5 * D }), t0)
      .length,
    0,
  );
  assert.equal(
    planGoalTimelineTl([], 0, pays).contributions.length,
    0,
    'with no stretches nothing goes in ahead',
  );
  const none = getTimelinePaceTl([], 0, pays, [], goalPayload());
  assert.equal(none.plannedByDateCents, 0);
  assert.equal(none.reachedOn, null);
  assert.equal(none.state, null, 'and it is not judged');

  const ended = read([base], goalHeader({ endedAt: t0 + 31 * D }));
  assert.equal(
    ended.stretches[0].until,
    t0 + 32 * D,
    'a future end cuts the stretch after its last day',
  );
  assert.equal(
    ended.pace.plannedByDateCents,
    60_000,
    'pays after a future end count nothing',
  );
  assert.equal(ended.pace.reachedOn, null);

  const planned = planGoalTimelineTl(
    toPaceStretchesTl(ended.stretches),
    0,
    pays,
  ).contributions;
  const cover = {
    goalId: 'g',
    heldCents: 10_000,
    contributions: planned.map((part) => ({
      on: part.day.on,
      cents: part.cents,
    })),
  };
  assert.equal(
    getGoalBalanceAtTl(cover, t0 + 160 * D),
    70_000,
    'an event after the goal ends draws on what it held then, not on pays after the end',
  );

  // A usual month reads the plan as that month holds it.
  const today = Date.UTC(2026, 10, 9);
  const dec1 = Date.UTC(2026, 11, 1);
  const billPayload = (cents: number) => ({
    name: 'Rent',
    amount: { lowCents: cents, highCents: cents },
    timing: {
      schedule: {
        kind: 'monthly',
        anchor: Date.UTC(2026, 9, 5),
        monthDays: [],
      },
    },
    ending: { onDate: null, afterCount: null },
    priority: 'must',
    orderIndex: 1,
  });
  const header = (id: string, kind: string, endedAt: number | null = null) => ({
    id,
    kind,
    createdAt: 1,
    endedAt,
    archivedAt: null,
    parentId: null,
  });
  const ver = (
    id: string,
    itemId: string,
    kind: string,
    payload: unknown,
    from: number,
    until: number | null = null,
    createdAt = 1,
  ) => ({
    id,
    itemId,
    kind,
    payload,
    effectiveFrom: from,
    effectiveUntil: until,
    createdAt,
  });
  const state = {
    runway: {
      items: [
        header('rent', 'bill'),
        header('gym', 'bill', Date.UTC(2026, 10, 20)),
        header('fund', 'goal'),
      ],
      versions: [
        ver('r1', 'rent', 'bill', billPayload(10_000), Date.UTC(2026, 8, 1)),
        ver('r2', 'rent', 'bill', billPayload(15_000), dec1, null, 2),
        ver('g1', 'gym', 'bill', billPayload(4_000), Date.UTC(2026, 8, 1)),
        ver(
          'f1',
          'fund',
          'goal',
          goalPayload({ funding: fund(30_000, 'none') }),
          Date.UTC(2026, 8, 1),
          Date.UTC(2026, 11, 15),
        ),
        ver('f2', 'fund', 'goal', goalPayload(), Date.UTC(2026, 11, 15)),
      ],
    },
  } as unknown as Parameters<typeof selectUsualMonthPlanTl>[0];
  const usual = selectUsualMonthPlanTl(state, today);
  assert.deepEqual(
    monthlyTotalTl(usual.bills.map(toBillMemberTl), usual.month).total,
    { lowCents: 15_000, highCents: 15_000 },
    'a change from Dec 1 counts when the month judged is December, and a bill ended in November does not',
  );
  assert.equal(
    usual.goals[0]?.version.payload.funding.cadence.kind,
    'everyIncomeDay',
    'a goal that starts mid-month counts from its start month',
  );
  const gym = selectBillsTl(state, today).find(({ item }) => item.id === 'gym');
  assert.ok(gym);
  assert.equal(
    monthlyTotalTl([toBillMemberTl(gym)], usual.month).total.highCents,
    0,
    'a bill stopped by its end date counts nothing in the month after it',
  );
  const envelope = (endedAt: number | null) => ({
    funding: fund(10_000, 'calendar'),
    startsOn: Date.UTC(2026, 8, 1),
    endedAt,
    incomeDaysPerMonth: 2,
  });
  assert.equal(
    monthlyTotalTl([], usual.month, [
      {
        ...envelope(Date.UTC(2026, 10, 20)),
        funding: {
          amount: { kind: 'exact', cents: 10_000 },
          cadence: { kind: 'calendar', period: 'monthly', startsOn: null },
        } as unknown as GoalSealed['funding'],
      },
    ]).total.highCents,
    0,
    'an envelope ended before the month counts nothing in it',
  );
}

// A bill is read as it stands on each payment's own due day, and a lookahead step counts each earlier pay once.
{
  const T = utc(2026, 11, 9);
  const exactRange = (cents: number) => ({ lowCents: cents, highCents: cents });
  const rule = (cents: number) => ({
    amount: { kind: 'exact', cents },
    cadence: { kind: 'everyIncomeDay' },
  });
  const monthlyOn = (anchor: number, day: number): Schedule => ({
    kind: 'monthly',
    anchor,
    monthDays: [day],
  });
  const stored = (
    id: string,
    itemId: string,
    kind: string,
    createdAt: number,
    from: number,
    until: number | null,
    payload: object,
  ) =>
    ({
      id,
      itemId,
      kind,
      createdAt,
      effectiveFrom: from,
      effectiveUntil: until,
      changeId: 'c',
      payload,
    }) as unknown as OpenVersion;
  const payLine = (id: string, schedule: Schedule, cents: number) => [
    stored('vsrc', 'src', 'source', 1, T, null, {
      name: 'Acme',
      pairings: [],
    }),
    stored(`v${id}`, id, 'payLine', 1, T, null, {
      name: 'Paycheck',
      accountId: null,
      schedule,
      amount: exactRange(cents),
      ending: NEVER,
      stanceOverride: null,
      pairings: [],
    }),
  ];
  const payItems = (id: string) => [
    item('src', 1),
    item(id, 1, { kind: 'payLine', parentId: 'src' }),
  ];
  const billVersion = (
    id: string,
    createdAt: number,
    from: number,
    until: number | null,
    cents: number,
    schedule: Schedule,
    fundedBy: object = { kind: 'lastBefore' },
  ) =>
    stored(id, 'rent', 'bill', createdAt, from, until, {
      name: 'Rent',
      emoji: null,
      priority: 'must',
      orderIndex: 1,
      amount: exactRange(cents),
      timing: { kind: 'date', schedule },
      ending: NEVER,
      fundedBy,
      groupId: null,
      stanceOverride: null,
    });
  const rentItem = item('rent', 2, { kind: 'bill' });
  const firstOfMonth = monthlyOn(utc(2026, 12, 1), 1);
  const twiceMonthly: Schedule = {
    kind: 'twiceMonthly',
    anchor: utc(2026, 11, 14),
    monthDays: [14, 28],
  };
  const pay = payLine('pay', twiceMonthly, 300_000);
  const stateOf = (versions: OpenVersion[]) =>
    ({
      runway: {
        ...runwayReducer(undefined, { type: 'init' }),
        items: [...payItems('pay'), rentItem],
        versions: [...pay, ...versions],
      },
    }) as unknown as Parameters<typeof selectBillPayments>[0];
  const paymentsOn = (versions: OpenVersion[], today = T) =>
    selectBillPayments(stateOf(versions), today).rent.map((payment) => [
      payment.dueOn,
      payment.totalCents,
    ]);

  // A raise from a later date applies to the payments due from it, not to every payment.
  const raise = [
    billVersion('r1', 1, T, null, 125_000, firstOfMonth),
    billVersion('r2', 2, utc(2027, 1, 1), null, 130_000, firstOfMonth),
  ];
  assert.deepEqual(
    paymentsOn(raise).slice(0, 3),
    [
      [utc(2026, 12, 1), 125_000],
      [utc(2027, 1, 1), 130_000],
      [utc(2027, 2, 1), 130_000],
    ],
    'a raise from Jan 1st leaves the Dec 1st payment at the old amount',
  );
  assert.deepEqual(
    paymentsOn(raise, utc(2027, 2, 10)).slice(0, 2),
    [
      [utc(2026, 12, 1), 125_000],
      [utc(2027, 1, 1), 130_000],
    ],
    'a past payment keeps its own due day’s amount once the raise is in force',
  );

  // A due day that changes from a later date moves only the payments from it.
  const moved = [
    billVersion('m1', 1, T, null, 125_000, firstOfMonth),
    billVersion('m2', 2, utc(2027, 1, 1), null, 125_000, {
      kind: 'monthly',
      anchor: utc(2027, 1, 15),
      monthDays: [15],
    }),
  ];
  assert.deepEqual(
    paymentsOn(moved)
      .slice(0, 4)
      .map(([dueOn]) => dueOn),
    [utc(2026, 12, 1), utc(2027, 1, 15), utc(2027, 2, 15), utc(2027, 3, 15)],
    'a due day moved from Jan 1st keeps Dec 1st and falls on the 15th after',
  );

  // A temporary amount covers its own stretch and the old one comes back after it.
  const temporary = [
    billVersion('t1', 1, T, null, 125_000, firstOfMonth),
    billVersion(
      't2',
      2,
      utc(2027, 1, 1),
      utc(2027, 2, 1),
      150_000,
      firstOfMonth,
    ),
  ];
  assert.deepEqual(
    paymentsOn(temporary).slice(0, 4),
    [
      [utc(2026, 12, 1), 125_000],
      [utc(2027, 1, 1), 150_000],
      [utc(2027, 2, 1), 125_000],
      [utc(2027, 3, 1), 125_000],
    ],
    'a temporary amount applies to the payments inside it only',
  );

  // The draft asks the pay right before a payment for that payment's amount, not the pay day's.
  const payItemsAll = [...payItems('pay'), rentItem];
  const dec28 = toDayKey('pay', utc(2026, 12, 28));
  const straddle = computeDraftView(
    payItemsAll,
    [...pay, ...raise],
    'conservative',
    [],
    dec28,
    T,
    {},
    '',
    {},
  );
  const rentLine = straddle?.draft.lines.find((line) => line.itemId === 'rent');
  assert.equal(
    rentLine?.cents,
    130_000,
    'the Dec 28th pay sets aside the $1,300 the Jan 1st payment will be',
  );
  assert.equal(rentLine?.bill?.totalCents, 130_000);
  const share = previewBillShareView(
    {
      items: payItemsAll,
      versions: [...pay, ...raise],
      openDays: [],
      stance: 'conservative',
      today: T,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
    },
    {
      kind: 'dayBill',
      day: buildComingDays(payItemsAll, [...pay, ...raise], T).find(
        (day) => day.dayKey === dec28,
      ) as ComingDay,
      billId: 'rent',
      cents: 999_999,
    },
  );
  assert.equal(
    share?.share.maxCents,
    130_000,
    'a pay’s most for the bill is the payment’s own amount',
  );

  // A lookahead step counts each earlier pay once: a goal and an envelope take ten pays of $100 to reach $1,000.
  const weekly: Schedule = {
    kind: 'weekly',
    anchor: utc(2026, 11, 13),
    monthDays: [],
  };
  const lookaheadItems = [
    ...payItems('pay2'),
    item('g', 3, { kind: 'goal' }),
    item('e', 4, { kind: 'envelope' }),
  ];
  const lookaheadVersions = [
    ...payLine('pay2', weekly, 500_000),
    stored('vg', 'g', 'goal', 1, T, null, {
      name: 'Trip',
      emoji: null,
      priority: 'should',
      orderIndex: 2,
      targetCents: 100_000,
      targetDate: null,
      funding: rule(10_000),
      state: 'active',
      groupId: null,
    }),
    stored('ve', 'e', 'envelope', 1, T, null, {
      name: 'Fun',
      emoji: null,
      priority: 'should',
      orderIndex: 3,
      funding: rule(10_000),
      maxCents: 100_000,
    }),
  ];
  const walkOf = (
    items: PlanItemDoc[],
    versions: OpenVersion[],
    heldByItem: Record<string, number> = {},
  ) =>
    computeLookahead(
      { items, versions, openDays: [] },
      {
        stance: 'conservative',
        today: T,
        heldByItem,
        settledKey: '',
        billProgress: {},
        startDate: null,
        recentFrom: T - 180 * DAY_MS,
        comingDays: buildComingDays(items, versions, T),
        bills: [],
        payments: {},
      },
    );
  const stepsOf = (look: Lookahead, itemId: string) =>
    look.steps.map(
      (step) => step.lines.find((line) => line.itemId === itemId)?.cents ?? 0,
    );
  const walked = walkOf(lookaheadItems, lookaheadVersions);
  [
    ['g', 'a goal'],
    ['e', 'an envelope with a max'],
  ].forEach(([id, label]) => {
    const steps = stepsOf(walked, id);
    assert.deepEqual(
      steps.slice(0, 11),
      [...Array(10).fill(10_000), 0],
      `${label} takes $100 on each of ten pays, then nothing`,
    );
  });

  // A bill spread over three pays asks $400 of each in a lookahead, as its own payment plan does.
  const rentWalkItems = [...payItems('pay2'), rentItem];
  const rentWalkVersions = [
    ...payLine('pay2', weekly, 500_000),
    billVersion('rw', 1, T, null, 120_000, firstOfMonth, {
      kind: 'suggested',
    }),
  ];
  const rentWalkDays = buildComingDays(rentWalkItems, rentWalkVersions, T);
  const rentWalk = computeLookahead(
    { items: rentWalkItems, versions: rentWalkVersions, openDays: [] },
    {
      stance: 'conservative',
      today: T,
      heldByItem: {},
      settledKey: '',
      billProgress: {},
      startDate: null,
      recentFrom: null,
      comingDays: rentWalkDays,
      bills: [{ item: rentItem, version: rentWalkVersions[2] }] as never,
      payments: {
        rent: planBillPayments(
          {
            itemId: 'rent',
            createdAt: 2,
            priority: 'must',
            orderIndex: 1,
            amount: exactRange(120_000),
            schedule: firstOfMonth,
            ending: NEVER,
            fundedBy: { kind: 'suggested' },
            stretches: getStretchesOf(rentWalkVersions, rentItem),
          },
          rentWalkDays,
          utc(2027, 11, 9),
          'conservative',
          { today: T },
        ),
      },
    },
  );
  assert.deepEqual(
    stepsOf(rentWalk, 'rent').slice(0, 3),
    [40_000, 40_000, 40_000],
    'a bill’s later pays are not asked for less because the earlier pays were counted twice',
  );

  // A walk over earlier days reads each one's own funding: $100 a pay, then $200 from Dec 1st, with $200 left to save.
  const otherWeek: Schedule = {
    kind: 'everyOtherWeek',
    anchor: utc(2026, 11, 20),
    monthDays: [],
  };
  const goalPayload = (cents: number) => ({
    name: 'Trip',
    emoji: null,
    priority: 'should',
    orderIndex: 2,
    targetCents: 100_000,
    targetDate: null,
    funding: rule(cents),
    state: 'active',
    groupId: null,
  });
  const changing = [
    ...payLine('pay3', otherWeek, 500_000),
    stored('g1', 'g', 'goal', 1, T, utc(2026, 12, 1), goalPayload(10_000)),
    stored('g2', 'g', 'goal', 2, utc(2026, 12, 1), null, goalPayload(20_000)),
  ];
  const dec4 = computeDraftView(
    [...payItems('pay3'), item('g', 3, { kind: 'goal' })],
    changing,
    'conservative',
    [],
    toDayKey('pay3', utc(2026, 12, 4)),
    T,
    { g: 80_000 },
    '',
    {},
  );
  assert.equal(
    dec4?.draft.lines.find((line) => line.itemId === 'g')?.cents,
    10_000,
    'the Nov 20th pay gave the $100 it was set to, so $100 of the $200 left is still to come',
  );
}

console.log('runway engine timeline: ok');
