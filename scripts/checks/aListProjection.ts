import assert from 'node:assert/strict';

// A showing's day is the viewer's local day; behind UTC it differs from the UTC day.
process.env.TZ = 'America/Los_Angeles';

import type {
  MembershipProfile,
  Viewing,
} from '../../src/apps/a-list/types.ts';
import { getCycleDate } from '../../src/apps/a-list/utils/billing.ts';
import {
  getBreakEven,
  getProjectionBase,
  parseTicketCents,
  projectCalendar,
  projectPace,
  projectStop,
} from '../../src/apps/a-list/utils/projection.ts';

const utc = (year: number, month: number, day: number, hour = 0) =>
  Date.UTC(year, month - 1, day, hour);
const membership = (startDate: number, taxRate: number | null = null) =>
  ({ startDate, monthlyTotalCents: 2500, taxRate }) as MembershipProfile;
const seen = (totalCents: number, feeAvoidedCents = 200) =>
  ({
    status: 'SEEN',
    ticket: { totalCents, feeAvoidedCents },
  }) as Viewing;
const planned = (showtimeAt: number, priceCents: number | null) =>
  ({
    status: 'PLANNED',
    showtimeAt,
    purchase: priceCents === null ? null : { priceCents },
  }) as Viewing;

// A 31st bills the last day of a short month, then the 31st again
const start31 = utc(2027, 1, 31);
assert.equal(getCycleDate(start31, 1), utc(2027, 2, 28));
assert.equal(getCycleDate(start31, 2), utc(2027, 3, 31));
assert.equal(getCycleDate(start31, 3), utc(2027, 4, 30));
assert.equal(getCycleDate(utc(2028, 1, 31), 1), utc(2028, 2, 29));
assert.equal(getCycleDate(utc(2026, 11, 15), 2), utc(2027, 1, 15));
assert.equal(getCycleDate(utc(2026, 11, 15), 14), utc(2028, 1, 15));

// No tickets: no average, three horizons, minimum still owed
const m = membership(utc(2026, 10, 14));
const fresh = getProjectionBase([], m, utc(2026, 10, 1));
assert.equal(fresh.averageTicketCents, null);
assert.equal(fresh.cyclesBilled, 0);
assert.equal(fresh.minimumMonthsLeft, 3);
assert.deepEqual(fresh.horizons, [3, 6, 9]);
assert.equal(getProjectionBase([], m, utc(2028, 1, 1)).horizons.length, 3);
assert.deepEqual(getProjectionBase([], m, utc(2030, 1, 1)).horizons.length, 3);

// Stop now pays the minimum, then whatever is already billed
const today = utc(2026, 11, 20);
const base = getProjectionBase([seen(1800), seen(2200)], m, today);
assert.equal(base.cyclesBilled, 2);
assert.equal(base.averageTicketCents, 2000);
assert.equal(base.netNowCents, 4000 - 2 * 2500);
assert.equal(projectStop(base, m).months, 3);
assert.equal(projectStop(base, m).netCents, 4000 - 3 * 2500);
const late = getProjectionBase([seen(1800)], m, utc(2027, 5, 20));
assert.equal(projectStop(late, m).months, 8);

// Calendar: the bill covering the last showing, in the viewer's local day
const now = utc(2026, 11, 20, 12);
const nearBill = planned(utc(2026, 12, 15, 4), 1700);
const result = projectCalendar(
  base,
  m,
  [nearBill, planned(utc(2026, 12, 20), null)],
  now,
);
assert.equal(result.movies, 2);
assert.equal(result.months >= 3, true);
assert.equal(projectCalendar(base, m, [], now).months, 3);
assert.equal(projectCalendar(base, m, [], now).addedCents, 0);
const noAverage = getProjectionBase([], m, today);
const unpriced = projectCalendar(
  noAverage,
  m,
  [planned(utc(2026, 12, 20), null)],
  now,
);
assert.equal(unpriced.unpricedCount, 1);
assert.equal(unpriced.addedCents, 0);
const over = projectCalendar(base, m, [planned(now - 1000, 1700)], now);
assert.equal(over.unmarkedCount, 1);
assert.equal(over.movies, 0);
// 04:00 UTC on a bill day is still the day before in Los Angeles, so that bill isn't owed
const mid = membership(utc(2026, 10, 15));
const midBase = getProjectionBase([seen(1800)], mid, utc(2026, 11, 20));
assert.equal(
  projectCalendar(midBase, mid, [planned(utc(2027, 1, 15, 4), 1700)], now)
    .months,
  3,
);
assert.equal(
  projectCalendar(midBase, mid, [planned(utc(2027, 1, 15, 20), 1700)], now)
    .months,
  4,
);
// AMC price + tax + average avoided fee
const taxed = membership(utc(2026, 10, 14), 0.1);
assert.equal(
  projectCalendar(base, taxed, [planned(utc(2026, 12, 1), 1000)], now)
    .addedCents,
  1000 + 100 + 200,
);

// Pace: no ticket value gives no net; the minimum floors the cost
const noValue = projectPace(
  base,
  m,
  today,
  { unit: 'week', count: 2 },
  3,
  null,
);
assert.equal(noValue.netCents, null);
const pace = projectPace(base, m, today, { unit: 'week', count: 2 }, 3, 2000);
assert.equal(pace.months, 3);
assert.equal(pace.coveredUntil, getCycleDate(m.startDate, 3));
assert.equal(
  pace.movies,
  Math.floor((2 * (pace.coveredUntil - today)) / (7 * 86_400_000)),
);

// Break even
assert.equal(getBreakEven(base, pace, null), null);
assert.equal(getBreakEven(base, pace, 0), null);
assert.equal(getBreakEven(base, { ...pace, costCents: 1000 }, 2000)?.movies, 0);
assert.equal(getBreakEven(base, { ...pace, costCents: 7500 }, 2000)?.movies, 2);

// A typed ticket value must be an amount and sane
assert.equal(parseTicketCents(''), null);
assert.equal(parseTicketCents('18.5'), 1850);
assert.equal(parseTicketCents('99999999'), null);

console.log('A-List projection checks passed');
