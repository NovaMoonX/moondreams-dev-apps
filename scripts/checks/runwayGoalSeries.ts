import assert from 'node:assert/strict';

import { getGoalSeries } from '../../src/apps/runway/utils/goalSeries.ts';

const DAY = 86_400_000;
const today = Date.UTC(2026, 9, 27);
const at = (offset: number) => today + offset * DAY;
const base = {
  heldCents: 30_000,
  targetCents: 60_000,
  targetDate: at(60),
  startDate: at(-30),
  splits: [
    { on: at(-14), cents: 10_000 },
    { on: at(-14), cents: 5_000 },
    { on: at(-1), cents: 5_000 },
  ],
  contributions: [
    { on: at(14), cents: 10_000 },
    { on: at(28), cents: 10_000 },
    { on: at(42), cents: 10_000 },
  ],
  today,
};

const full = getGoalSeries(base);
assert.deepEqual(
  full.points.filter((p) => p.y !== null).map((p) => [p.x, p.y]),
  [
    [at(-30), 10_000],
    [at(-14), 25_000],
    [at(-1), 30_000],
    [today, 30_000],
  ],
  'the first point carries what was held before the days read, same-day splits merge',
);
assert.equal(
  full.points.find((p) => p.x === today)?.y2,
  30_000,
  'the projection starts at today',
);
assert.equal(full.reachedOn, at(42), 'reached on the day the plan gets there');
assert.equal(full.points.at(-1)?.x, at(60), 'runs on to the target date');
assert.equal(full.hasProjection, true);

const short = getGoalSeries({
  ...base,
  contributions: base.contributions.slice(0, 1),
});
assert.equal(short.reachedOn, null, 'never reached');
assert.deepEqual(
  short.points.at(-1),
  { x: at(60), y: null, y2: 40_000 },
  'the line runs to the target date',
);

const paused = getGoalSeries({ ...base, contributions: [] });
assert.equal(paused.hasProjection, false);
assert.equal(
  paused.points.every((p) => p.y !== null),
  true,
);

const none = getGoalSeries({
  ...base,
  heldCents: 0,
  splits: [],
  contributions: [],
  startDate: today,
});
assert.equal(none.hasChart, false, 'one point shows no chart');

const done = getGoalSeries({ ...base, heldCents: 60_000, splits: [] });
assert.equal(
  done.reachedOn,
  null,
  'a goal already at its target has nothing to reach',
);
assert.equal(done.points.at(-1)?.y, 60_000, 'ends at what it holds');

const late = getGoalSeries({
  ...base,
  contributions: [{ on: at(90), cents: 10_000 }],
});
assert.equal(
  late.hasProjection,
  false,
  'a day after the target date is left out',
);
console.log('runwayGoalSeries: ok');
