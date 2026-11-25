import { isDeepStrictEqual } from 'node:util';

import { dayInZone } from '../engine/dates.js';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const REWORK_GAP_MS = MINUTE_MS;
export const GUARDED_GAP_MS = 10 * MINUTE_MS;
export const FULL_REWORKS_PER_DAY = 60;
const MIDNIGHT_DELAY_MS = 5 * MINUTE_MS;
const BACKOFF_MS = [MINUTE_MS, 5 * MINUTE_MS, 15 * MINUTE_MS, HOUR_MS];

/** `apps/runway/reworks/{uid}`: when a plan's figures are next worked out. Only Functions reach it. */
export interface ReworkState {
  uid: string;
  dueAt: number;
  seq: number;
  lastRunAt: number;
  leaseUntil: number;
  failures: number;
  nextMidnightAt: number;
  runsDay: number;
  runsToday: number;
}

export const reworkPath = (uid: string) => `apps/runway/reworks/${uid}`;

/** The plan fields a rework reads; a write to any other (the share summary, what the person has seen, notify, sorting) never starts one. */
export const COUNTED_PLAN_FIELDS = [
  'startDate',
  'trackingPeriods',
  'stance',
  'sealed',
  'updatedAt',
  'dirtyFrom',
  'keyId',
] as const;

/** A plan's first state: due as soon as a change gives it a time. */
export const newReworkState = (uid: string): ReworkState => ({
  uid,
  dueAt: Number.MAX_SAFE_INTEGER,
  seq: 0,
  lastRunAt: 0,
  leaseUntil: 0,
  failures: 0,
  nextMidnightAt: 0,
  runsDay: 0,
  runsToday: 0,
});

/** True when the plan was created or deleted, or one of the fields the figures read changed. */
export function isCountedPlanChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (before === undefined || after === undefined) return true;
  return COUNTED_PLAN_FIELDS.some(
    (field) => !isDeepStrictEqual(before[field], after[field]),
  );
}

/** The backoff after the `failures`-th failure in a row: 1, 5, 15, then 60 minutes. */
export const backoffMs = (failures: number) =>
  BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1];

/** The least time after the last run before another may start: the backoff while failing, ten minutes once the day's 60 full reworks are spent, a minute otherwise. */
export function gapAfterRun(
  state: Pick<ReworkState, 'failures' | 'runsToday' | 'nextMidnightAt'>,
  now: number,
): number {
  if (state.failures > 0) return backoffMs(state.failures);
  const isSpent =
    state.runsToday >= FULL_REWORKS_PER_DAY && now < state.nextMidnightAt;
  return isSpent ? GUARDED_GAP_MS : REWORK_GAP_MS;
}

/** When the plan is due after a change: never later than it already was, and never sooner than a gap after the last run. */
export const dueAfterChange = (
  state: Pick<
    ReworkState,
    'dueAt' | 'lastRunAt' | 'failures' | 'runsToday' | 'nextMidnightAt'
  >,
  now: number,
) =>
  Math.min(
    state.dueAt,
    Math.max(now, state.lastRunAt + gapAfterRun(state, now)),
  );

/** The offset of a zone from UTC at an instant, in ms. */
const zoneOffsetMs = (zone: string, at: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return local - Math.floor(at / 1000) * 1000;
};

/** Five minutes past the next local midnight in the zone, right across a change of clocks. */
export function nextMidnightAfter(now: number, zone: string): number {
  const tomorrow = dayInZone(now, zone) + 24 * HOUR_MS;
  const first = tomorrow - zoneOffsetMs(zone, tomorrow);
  const guess = tomorrow - zoneOffsetMs(zone, first);
  const start =
    [guess, first, first + HOUR_MS].find(
      (instant) => dayInZone(instant, zone) === tomorrow,
    ) ?? first;
  return start + MIDNIGHT_DELAY_MS;
}

const isZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** The plan's own zone, else the one its push hour is in, else UTC. */
export const pickZone = (
  timeZone: string | null | undefined,
  notifyTimeZone: string | null | undefined,
): string => [timeZone, notifyTimeZone].find(isZone) ?? 'UTC';

/** The state after a run that started at `now`: due again at midnight or in six hours when nothing was written meanwhile, a gap later when something was; a held alert's `wakeAt` brings it sooner. */
export function afterRun(
  state: ReworkState,
  seqAtStart: number,
  now: number,
  zone: string,
  wakeAt: number | null,
): ReworkState {
  const day = dayInZone(now, zone);
  const nextMidnightAt = nextMidnightAfter(now, zone);
  const runsToday = (state.runsDay === day ? state.runsToday : 0) + 1;
  const next = {
    ...state,
    lastRunAt: now,
    leaseUntil: 0,
    failures: 0,
    nextMidnightAt,
    runsDay: day,
    runsToday,
  };
  const dueAt =
    state.seq === seqAtStart
      ? Math.min(nextMidnightAt, now + 6 * HOUR_MS)
      : now + gapAfterRun(next, now);
  return { ...next, dueAt: Math.min(dueAt, wakeAt ?? dueAt) };
}

/** The state after a failed run: the next try waits out the backoff, however many writes come meanwhile. */
export function afterFailure(state: ReworkState, now: number): ReworkState {
  const failures = state.failures + 1;
  return {
    ...state,
    lastRunAt: now,
    leaseUntil: 0,
    failures,
    dueAt: now + backoffMs(failures),
  };
}
