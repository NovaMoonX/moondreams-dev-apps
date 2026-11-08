import assert from 'node:assert/strict';

import { resolveSunset } from '../../src/lib/theme/sunsetTheme.ts';

// Run with TZ=America/Los_Angeles (the npm script sets it): the clock-change days are the point.
const LOS_ANGELES = { latitude: 34.1, longitude: -118.2 };

const minutesOn = (date: string) => {
  const { todayMinutes } = resolveSunset(new Date(`${date}T12:00:00`).getTime(), LOS_ANGELES, true);
  assert.ok(todayMinutes, `${date}: no times`);
  return todayMinutes;
};

const clock = (minute: number) => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;

[
  ['2026-03-07', '2026-03-08'],
  ['2026-03-08', '2026-03-09'],
  ['2026-10-31', '2026-11-01'],
  ['2026-11-01', '2026-11-02'],
].forEach(([before, after]) => {
  const first = minutesOn(before);
  const second = minutesOn(after);
  const jump = (a: number, b: number) => Math.abs(a - b);
  // Across a clock change the wall-clock times jump by about 60 minutes; anything else is a day's drift.
  const isChange = (date: string) => date === '2026-03-08' || date === '2026-11-01';
  const expected = isChange(after) ? 60 : 0;
  assert.ok(
    Math.abs(jump(first.set, second.set) - expected) <= 3,
    `sunset ${before} ${clock(first.set)} → ${after} ${clock(second.set)}`,
  );
  assert.ok(
    Math.abs(jump(first.rise, second.rise) - expected) <= 3,
    `sunrise ${before} ${clock(first.rise)} → ${after} ${clock(second.rise)}`,
  );
});

// Published times for Los Angeles, within a few minutes.
const near = (date: string, rise: string, set: string) => {
  const times = minutesOn(date);
  const toMinute = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  assert.ok(Math.abs(times.rise - toMinute(rise)) <= 4, `${date} sunrise ${clock(times.rise)} vs ${rise}`);
  assert.ok(Math.abs(times.set - toMinute(set)) <= 4, `${date} sunset ${clock(times.set)} vs ${set}`);
};
near('2026-03-08', '07:14', '18:56');
near('2026-11-01', '06:14', '17:01');
near('2026-11-08', '06:20', '16:55');

// The evening's next switch is tomorrow's sunrise, even when tomorrow the clocks change.
const evening = resolveSunset(new Date('2026-03-07T21:00:00').getTime(), LOS_ANGELES, true).state;
assert.equal(evening.isDark, true);
assert.equal(evening.nextSwitchTo, 'light');
assert.equal(new Date(evening.nextSwitchAt).getHours(), 7);

// Polar night and polar day.
const svalbard = { latitude: 78.2, longitude: 15.6 };
const polarNight = resolveSunset(new Date('2026-12-21T12:00:00').getTime(), svalbard, false);
assert.equal(polarNight.state.isDark, true);
assert.equal(polarNight.state.nextSwitchTo, null);
const polarDay = resolveSunset(new Date('2026-06-21T03:00:00').getTime(), svalbard, false);
assert.equal(polarDay.state.isDark, false);

console.log('sunset-times: clock-change days, published times and polar days all hold');
