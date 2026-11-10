import assert from 'node:assert/strict';

import {
  getRecentAdoptionAnniversaries,
  getUpcomingBirthdays,
  nextOccurrenceOnOrAfter,
} from '../../src/apps/nine-lives/utils/catAnniversaries.ts';
import { toDayKey } from '../../src/apps/helm/utils/planDays.ts';
import {
  daysUntil,
  formatMoment,
  formatYearlyDate,
  nextYearlyOccurrence,
  yearsOn,
} from '../../src/utils/yearlyDateUtils.ts';

const leap = { month: 2, day: 29 };

assert.equal(
  nextYearlyOccurrence({ month: 6, day: 3 }, '2026-11-10'),
  '2027-06-03',
  'passed this year',
);
assert.equal(
  nextYearlyOccurrence({ month: 11, day: 10 }, '2026-11-10'),
  '2026-11-10',
  'today counts',
);
assert.equal(
  nextYearlyOccurrence({ month: 11, day: 14 }, '2026-11-10'),
  '2026-11-14',
  'later this year',
);
assert.equal(
  nextYearlyOccurrence(leap, '2026-11-10'),
  '2027-02-28',
  '29 Feb on the 28th in 2027',
);
assert.equal(
  nextYearlyOccurrence(leap, '2027-02-28'),
  '2027-02-28',
  'the 28th is the day itself',
);
assert.equal(
  nextYearlyOccurrence(leap, '2027-03-01'),
  '2028-02-29',
  'a leap year keeps the 29th',
);
assert.equal(nextYearlyOccurrence(leap, '2028-02-29'), '2028-02-29');
assert.equal(nextYearlyOccurrence(leap, '2028-03-01'), '2029-02-28');
assert.equal(
  nextYearlyOccurrence(leap, '2100-01-01'),
  '2100-02-28',
  '2100 is not a leap year',
);
assert.equal(nextYearlyOccurrence(leap, '2000-01-01'), '2000-02-29', '2000 is');
assert.equal(
  nextYearlyOccurrence({ month: 1, day: 2 }, '2026-12-30'),
  '2027-01-02',
  "the year's turn",
);
assert.equal(
  nextYearlyOccurrence({ month: 12, day: 31 }, '2026-12-30'),
  '2026-12-31',
);

assert.equal(daysUntil('2026-12-30', '2027-01-02'), 3);
assert.equal(daysUntil('2026-11-10', '2026-11-10'), 0);
assert.equal(daysUntil('2027-02-28', '2028-02-29'), 366);
assert.equal(daysUntil('2026-11-10', '2026-11-09'), -1);

assert.equal(formatYearlyDate({ month: 6, day: 3, year: null }), 'June 3');
assert.equal(formatYearlyDate({ month: 6, day: null, year: 2020 }), 'Jun 2020');
assert.equal(
  formatMoment({ precision: 'day', month: 8, day: 3, year: 2024 }),
  'Aug 3, 2024',
);
assert.equal(
  formatMoment({ precision: 'month', month: 3, day: null, year: 2015 }),
  'Mar 2015',
);
assert.equal(
  formatMoment({ precision: 'year', month: null, day: null, year: 1998 }),
  '1998',
);
assert.equal(
  formatMoment({ precision: 'decade', month: null, day: null, year: 1980 }),
  'the 1980s',
);
assert.equal(
  formatMoment({ precision: 'decade', month: null, day: null, year: 1987 }),
  'the 1980s',
  'a decade names its decade from any year in it',
);
assert.equal(formatYearlyDate({ month: 8, day: null, year: 1984 }), 'Aug 1984');
assert.equal(
  formatYearlyDate({ month: 6, day: 3, year: 1984 }),
  'June 3, 1984',
);

assert.equal(yearsOn({ year: 1994 }, '2027-03-03'), 33);
assert.equal(yearsOn({ year: null }, '2027-03-03'), null);

// The same instant is a different day for a zone ahead of and behind UTC.
const instant = Date.UTC(2026, 11, 30, 20, 0);
const auckland = toDayKey(instant, 'Pacific/Auckland');
const losAngeles = toDayKey(instant, 'America/Los_Angeles');
assert.equal(auckland, '2026-12-31');
assert.equal(losAngeles, '2026-12-30');
assert.equal(
  nextYearlyOccurrence({ month: 12, day: 31 }, auckland),
  '2026-12-31',
  'a birthday that is today in Auckland',
);
assert.equal(
  daysUntil(
    losAngeles,
    nextYearlyOccurrence({ month: 12, day: 31 }, losAngeles),
  ),
  1,
  'tomorrow in Los Angeles',
);
assert.equal(
  nextYearlyOccurrence({ month: 1, day: 1 }, auckland),
  '2027-01-01',
);

// Nine Lives: the same math, still UTC midnights, the banner window unchanged.
const now = Date.UTC(2026, 10, 10, 15, 0);
assert.equal(
  nextOccurrenceOnOrAfter(Date.UTC(2020, 10, 10), now),
  Date.UTC(2026, 10, 10),
  'a cat birthday today',
);
assert.equal(
  nextOccurrenceOnOrAfter(Date.UTC(2020, 10, 9), now),
  Date.UTC(2027, 10, 9),
  'yesterday rolls to next year',
);
assert.equal(
  nextOccurrenceOnOrAfter(Date.UTC(2020, 1, 29), now),
  Date.UTC(2027, 1, 28),
  'a 29 Feb cat lands on 28 Feb',
);
assert.equal(
  nextOccurrenceOnOrAfter(Date.UTC(2020, 1, 29), Date.UTC(2027, 2, 1)),
  Date.UTC(2028, 1, 29),
);
const cats = [
  { id: 'a', dateOfBirth: Date.UTC(2020, 10, 14) },
  { id: 'b', dateOfBirth: Date.UTC(2019, 10, 20) },
  { id: 'c', dateOfBirth: Date.UTC(2018, 10, 10) },
  { id: 'd', dateOfBirth: Date.UTC(2018, 10, 9) },
] as Parameters<typeof getUpcomingBirthdays>[0];
assert.deepEqual(
  getUpcomingBirthdays(cats, now).map((entry) => [
    entry.catId,
    entry.daysUntil,
  ]),
  [
    ['c', 0],
    ['a', 4],
  ],
  'the banner lists today and the next 7 days only',
);

const gotcha = getRecentAdoptionAnniversaries(
  [{ id: 'leap', adoptedAt: Date.UTC(2020, 1, 29) }] as Parameters<
    typeof getRecentAdoptionAnniversaries
  >[0],
  Date.UTC(2027, 2, 1),
);
assert.equal(
  gotcha[0]?.occursAt,
  Date.UTC(2027, 1, 28),
  'a 29 February gotcha day falls on 28 February in a common year',
);
assert.equal(gotcha[0]?.daysSince, 1);

console.log('yearly dates ok');
