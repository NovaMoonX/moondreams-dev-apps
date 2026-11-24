// `npm run check:runway-rework` covers the pure rules that decide when a plan's figures are reworked on the server: the one-a-minute debounce, the run that comes back after a write during it, local midnight across clock changes, the backoff, the cost guard, the zone and which plan fields count.
import assert from 'node:assert/strict';

import {
  afterFailure,
  afterRun,
  backoffMs,
  dueAfterChange,
  gapAfterRun,
  HOUR_MS,
  isCountedPlanChange,
  MINUTE_MS,
  newReworkState,
  nextMidnightAfter,
  pickZone,
  type ReworkState,
} from '../../functions/src/apps/runway/figures/reworkState.ts';

const at = (iso: string) => Date.parse(iso);
const state = (patch: Partial<ReworkState> = {}): ReworkState => ({
  ...newReworkState('plan'),
  ...patch,
});

// A burst of writes moves dueAt at most once a minute: the first sets it, the rest keep it.
const burst = Array.from(
  { length: 50 },
  (_, index) => at('2026-05-01T12:00:00Z') + index * 500,
).reduce(
  (current, now) => ({
    ...current,
    seq: current.seq + 1,
    dueAt: dueAfterChange(current, now),
  }),
  state({
    lastRunAt: at('2026-05-01T11:59:30Z'),
    dueAt: at('2026-05-02T07:05:00Z'),
  }),
);
assert.equal(
  burst.dueAt,
  at('2026-05-01T12:00:30Z'),
  'a burst is due a minute after the last run',
);
assert.equal(burst.seq, 50);
assert.equal(
  dueAfterChange(
    state({ lastRunAt: 0, dueAt: Number.MAX_SAFE_INTEGER }),
    at('2026-05-01T12:00:00Z'),
  ),
  at('2026-05-01T12:00:00Z'),
  'a plan never reworked is due now',
);
assert.equal(
  dueAfterChange(
    state({
      lastRunAt: at('2026-05-01T11:00:00Z'),
      dueAt: at('2026-05-01T12:00:10Z'),
    }),
    at('2026-05-01T12:00:00Z'),
  ),
  at('2026-05-01T12:00:00Z'),
  'a change a long while after the last run is due now',
);
assert.equal(
  dueAfterChange(
    state({
      lastRunAt: at('2026-05-01T11:59:50Z'),
      dueAt: at('2026-05-01T12:00:20Z'),
    }),
    at('2026-05-01T12:00:00Z'),
  ),
  at('2026-05-01T12:00:20Z'),
  'a change never pushes dueAt later',
);

// A run that saw a write during it comes back in 60 seconds; a quiet one waits for midnight or six hours.
const started = at('2026-05-01T12:00:00Z');
const quiet = afterRun(state({ seq: 3 }), 3, started, 'UTC');
assert.equal(
  quiet.dueAt,
  started + 6 * HOUR_MS,
  'six hours when midnight is further',
);
assert.equal(quiet.seq, 3);
assert.equal(quiet.leaseUntil, 0);
assert.equal(quiet.lastRunAt, started);
assert.equal(
  afterRun(state({ seq: 3 }), 3, at('2026-05-01T20:00:00Z'), 'UTC').dueAt,
  at('2026-05-02T00:05:00Z'),
  'midnight when it is nearer than six hours',
);
assert.equal(
  afterRun(state({ seq: 4 }), 3, started, 'UTC').dueAt,
  started + MINUTE_MS,
  'a write during the run comes back in 60s',
);
assert.equal(
  afterRun(state({ seq: 4, failures: 2 }), 3, started, 'UTC').failures,
  0,
  'a run clears the failures',
);

// Midnight plus five minutes, in a zone, across a change of clocks.
const midnights: [string, string, string][] = [
  ['UTC', '2026-05-01T12:00:00Z', '2026-05-02T00:05:00Z'],
  ['UTC', '2026-05-01T23:59:00Z', '2026-05-02T00:05:00Z'],
  ['America/Los_Angeles', '2026-05-01T12:00:00Z', '2026-05-02T07:05:00Z'],
  ['America/Los_Angeles', '2026-03-07T20:00:00Z', '2026-03-08T08:05:00Z'],
  ['America/Los_Angeles', '2026-03-08T12:00:00Z', '2026-03-09T07:05:00Z'],
  ['America/Los_Angeles', '2026-11-01T12:00:00Z', '2026-11-02T08:05:00Z'],
  ['America/Los_Angeles', '2026-10-31T20:00:00Z', '2026-11-01T07:05:00Z'],
  ['Pacific/Auckland', '2026-05-01T12:00:00Z', '2026-05-02T12:05:00Z'],
  ['Pacific/Auckland', '2026-09-26T05:00:00Z', '2026-09-26T12:05:00Z'],
  ['Pacific/Auckland', '2026-09-27T05:00:00Z', '2026-09-27T11:05:00Z'],
  ['Pacific/Auckland', '2026-04-04T05:00:00Z', '2026-04-04T11:05:00Z'],
  ['Pacific/Auckland', '2026-04-05T05:00:00Z', '2026-04-05T12:05:00Z'],
];
midnights.forEach(([zone, now, expected]) =>
  assert.equal(
    new Date(nextMidnightAfter(at(now), zone)).toISOString(),
    new Date(at(expected)).toISOString(),
    `${zone} after ${now}`,
  ),
);

// Backoff: 1, 5, 15, 60 minutes, then it stays at 60.
assert.deepEqual(
  [1, 2, 3, 4, 5, 9].map((failures) => backoffMs(failures) / MINUTE_MS),
  [1, 5, 15, 60, 60, 60],
);
const failed = afterFailure(state({ failures: 3, seq: 9 }), started);
assert.equal(failed.failures, 4);
assert.equal(failed.dueAt, started + HOUR_MS);
assert.equal(failed.leaseUntil, 0);
assert.equal(
  dueAfterChange(failed, started + 5 * MINUTE_MS),
  started + HOUR_MS,
  'writes during a backoff do not cut it short',
);

// Cost guard: 60 full reworks in a local day slow the plan to one run in ten minutes until local midnight.
const midnight = at('2026-05-02T00:05:00Z');
const noon = at('2026-05-01T12:00:00Z');
const gapAt = (runsToday: number, now: number) =>
  gapAfterRun({ failures: 0, runsToday, nextMidnightAt: midnight }, now) /
  MINUTE_MS;
assert.deepEqual(
  [59, 60, 61].map((runs) => gapAt(runs, noon)),
  [1, 10, 10],
);
assert.equal(gapAt(61, midnight), 1, 'the guard ends at local midnight');
const guarded = state({
  runsToday: 60,
  runsDay: at('2026-05-01T00:00:00Z'),
  nextMidnightAt: midnight,
  lastRunAt: noon,
});
assert.equal(
  dueAfterChange({ ...guarded, dueAt: noon + HOUR_MS }, noon + 2 * MINUTE_MS),
  noon + 10 * MINUTE_MS,
);
assert.equal(
  afterRun({ ...guarded, seq: 2 }, 1, noon + HOUR_MS, 'UTC').dueAt,
  noon + HOUR_MS + 10 * MINUTE_MS,
);
assert.equal(
  afterRun(guarded, 0, noon, 'UTC').runsToday,
  61,
  'runs are counted in the same local day',
);
const nextDay = afterRun({ ...guarded, seq: 2 }, 1, midnight, 'UTC');
assert.equal(nextDay.runsToday, 1, 'a new local day starts the count again');
assert.equal(nextDay.dueAt, midnight + MINUTE_MS);
const countedLA = afterRun(
  state({ runsDay: at('2026-05-01T00:00:00Z'), runsToday: 7 }),
  0,
  at('2026-05-02T05:00:00Z'),
  'America/Los_Angeles',
);
assert.equal(countedLA.runsToday, 8, 'the day is the plan zone day, not UTC');

// The zone: the plan's, else the push hour's, else UTC; a name that is not a zone is skipped.
assert.equal(pickZone('Europe/Paris', 'Asia/Tokyo'), 'Europe/Paris');
assert.equal(pickZone(null, 'Asia/Tokyo'), 'Asia/Tokyo');
assert.equal(pickZone(undefined, null), 'UTC');
assert.equal(pickZone('Not/AZone', 'Asia/Tokyo'), 'Asia/Tokyo');
assert.equal(pickZone('', ''), 'UTC');

// Which plan changes count.
const plan = {
  startDate: 1,
  trackingPeriods: [{ level: 'plan', from: 1 }],
  stance: 'middle',
  sealed: { value: 'a', nonce: 'n' },
  updatedAt: 5,
  dirtyFrom: null,
  keyId: 'k',
  shareSummary: { value: 's' },
  doneForYouSeenAt: 1,
  notify: { needsHome: true },
  sorting: null,
};
const counts = (patch: Record<string, unknown>) =>
  isCountedPlanChange(plan, { ...plan, ...patch });
[
  { startDate: 2 },
  { trackingPeriods: [] },
  { trackingPeriods: [{ level: 'plan', from: 2 }] },
  { stance: 'optimistic' },
  { sealed: { value: 'b', nonce: 'n' } },
  { updatedAt: 6 },
  { dirtyFrom: '2026-01' },
  { keyId: 'k2' },
].forEach((patch) =>
  assert.equal(counts(patch), true, `${Object.keys(patch)[0]} counts`),
);
[
  { shareSummary: { value: 't' } },
  { shareSummary: null },
  { doneForYouSeenAt: 2 },
  { notify: { needsHome: false } },
  { sorting: { x: 1 } },
  { somethingElse: true },
].forEach((patch) =>
  assert.equal(counts(patch), false, `${Object.keys(patch)[0]} does not count`),
);
assert.equal(isCountedPlanChange(plan, plan), false);
assert.equal(
  isCountedPlanChange(undefined, plan),
  true,
  'a created plan counts',
);
assert.equal(
  isCountedPlanChange(plan, undefined),
  true,
  'a deleted plan counts',
);

console.log('runway rework: every case passed');
