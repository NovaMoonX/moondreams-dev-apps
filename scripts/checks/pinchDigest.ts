import assert from 'node:assert/strict';

import {
  CONTAINER_EAT_SOON_DAYS,
  DEFAULT_LEAD_DAYS,
} from '../../src/apps/pinch/constants.ts';
import {
  getDaysLeft as appDaysLeft,
  getEatByState,
} from '../../src/apps/pinch/utils/containers.ts';
import {
  DAY_MS,
  DIGEST_PAST_DAYS,
  SEND_WINDOW_MS,
  dayToUtcMidnight,
  formatNames,
  getDaysLeft as digestDaysLeft,
  getDigestBounds,
  getDigestMessage,
  getDigestRun,
  getLocalMoment,
  getDigestLink,
  mergeDigestItems,
  resolveZone,
  toDigestItems,
  toPackageDigestItems,
  type DigestItem,
} from '../../functions/src/apps/pinch/eatSoonDigest.ts';
import { getPackageState } from '../../src/apps/pinch/utils/packages.ts';

const item = (name: string, daysLeft: number): DigestItem => ({
  name,
  daysLeft,
});
const names = (count: number, daysLeft = 0) =>
  Array.from({ length: count }, (_, index) =>
    item(`Dish ${String.fromCharCode(65 + index)}`, daysLeft),
  );

// The function's day arithmetic is the app's: same days left, same "due soon" window, in zones on both sides of UTC and across local midnight.
assert.equal(
  DEFAULT_LEAD_DAYS,
  CONTAINER_EAT_SOON_DAYS,
  "the note's default lead time is the window the app tints",
);
['America/Los_Angeles', 'Pacific/Auckland', 'UTC', 'Asia/Kolkata'].forEach(
  (zone) => {
    process.env.TZ = zone;
    [
      Date.UTC(2026, 9, 18, 6, 30),
      Date.UTC(2026, 9, 18, 16, 0),
      Date.UTC(2026, 9, 18, 23, 30),
      Date.UTC(2026, 9, 19, 0, 30),
    ].forEach((now) => {
      const today = dayToUtcMidnight(getLocalMoment(now, zone).day);
      [-4, -2, -1, 0, 1, 2, 3, 4].forEach((offset) => {
        const eatBy = today + offset * DAY_MS;
        assert.equal(
          digestDaysLeft(eatBy, today),
          appDaysLeft(eatBy, now),
          `${zone}: days left from ${new Date(now).toISOString()} agree for ${offset}`,
        );
        const { from, to } = getDigestBounds(today, DEFAULT_LEAD_DAYS);
        const isCounted = eatBy >= from && eatBy <= to;
        assert.equal(
          isCounted,
          getEatByState(eatBy, now) !== 'LATER' && offset >= -DIGEST_PAST_DAYS,
          `${zone}: with the default lead the note counts what the app calls due, plus the day just past`,
        );
      });
    });
  },
);

// Which run sends: the first half hour of the person's own hour, once a day
const at = (day: number, hour: number, minute: number) =>
  Date.UTC(2026, 9, day, hour, minute);
const settings = {
  hour: 9,
  timeZone: 'America/Los_Angeles',
  lastDigestDay: null,
};
assert.deepEqual(
  getDigestRun(at(18, 16, 0), settings)?.day,
  '2026-10-18',
  '9:00 in Los Angeles (PDT) is 16:00 UTC: the run sends, for that local day',
);
assert.notEqual(
  getDigestRun(at(18, 16, 29), settings),
  null,
  '9:29 still sends',
);
assert.equal(
  getDigestRun(at(18, 16, 30), settings),
  null,
  'at 9:30 the hour has been going for half an hour, so a late run drops the note',
);
assert.equal(getDigestRun(at(18, 15, 59), settings), null, '8:59 is too early');
assert.equal(
  getDigestRun(at(18, 17, 0), settings),
  null,
  '10:00 is the next hour',
);
assert.equal(
  getDigestRun(at(18, 16, 0), { ...settings, lastDigestDay: '2026-10-18' }),
  null,
  'already sent today: no second note',
);
assert.notEqual(
  getDigestRun(at(18, 16, 0), { ...settings, lastDigestDay: '2026-10-17' }),
  null,
  "yesterday's stamp doesn't stop today's",
);
assert.equal(
  getDigestRun(at(18, 16, 0), { ...settings, timeZone: 'Asia/Kolkata' }),
  null,
  "the same instant is 21:30 in Kolkata, which isn't the hour they chose",
);
assert.equal(
  getDigestRun(at(18, 3, 30), {
    hour: 9,
    timeZone: 'Asia/Kolkata',
    lastDigestDay: null,
  })?.day,
  '2026-10-18',
  'a half-hour zone gets its note on the :30 run',
);
assert.equal(
  getDigestRun(at(18, 9, 0), { hour: 9, timeZone: null, lastDigestDay: null })
    ?.day,
  '2026-10-18',
  'no zone reads as UTC',
);
assert.equal(
  getDigestRun(at(18, 9, 0), {
    hour: 9,
    timeZone: 'Not/AZone',
    lastDigestDay: null,
  })?.day,
  '2026-10-18',
  'a zone the runtime does not know reads as UTC too',
);
assert.equal(resolveZone('Europe/Paris'), 'Europe/Paris');
assert.equal(resolveZone(42), 'UTC');

// Whatever the zone's offset, exactly one of the half-hourly runs in a day is the one that sends
[
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Pacific/Chatham',
  'Pacific/Auckland',
  'UTC',
  'America/St_Johns',
].forEach((timeZone) => {
  const runs = Array.from(
    { length: 96 },
    (_, index) => at(18, 0, 0) + index * SEND_WINDOW_MS,
  );
  const day = (run: number) => getLocalMoment(run, timeZone).day;
  const sending = runs.filter(
    (run) =>
      getDigestRun(run, { hour: 9, timeZone, lastDigestDay: null }) !== null &&
      day(run) === day(at(18, 12, 0)),
  );
  assert.equal(sending.length, 1, `${timeZone}: one run a day sends`);
});

// Clocks going back: the 1:00 hour happens twice, and the stamp is what keeps it to one note
const first = getDigestRun(Date.UTC(2026, 10, 1, 8, 0), {
  hour: 1,
  timeZone: 'America/Los_Angeles',
  lastDigestDay: null,
});
const second = getDigestRun(Date.UTC(2026, 10, 1, 9, 0), {
  hour: 1,
  timeZone: 'America/Los_Angeles',
  lastDigestDay: first?.day ?? null,
});
assert.equal(first?.day, '2026-11-01');
assert.equal(
  second,
  null,
  'the repeated hour sends nothing once the first stamped the day',
);

// Boxes become one item per dish
assert.deepEqual(toDigestItems([], 0), [], 'nothing in stock, nothing to say');
const today = dayToUtcMidnight('2026-10-18');
assert.deepEqual(
  toDigestItems(
    [
      { title: 'Adobo chicken', eatBy: today + DAY_MS },
      { title: 'adobo  chicken ', eatBy: today },
      { title: 'Adobo chicken', eatBy: today + 2 * DAY_MS },
      { title: 'Chicken stock', eatBy: today - DAY_MS },
      { title: 'Chili', eatBy: today + DAY_MS },
    ],
    today,
  ),
  [item('Chicken stock', -1), item('adobo chicken', 0), item('Chili', 1)],
  'five boxes of one dish are one item at its nearest date, by case and spacing; nearest first, then by name',
);
assert.deepEqual(
  toDigestItems(
    [
      { title: 7, eatBy: today },
      { title: '  ', eatBy: today },
      { title: 'Soup', eatBy: 'tomorrow' },
      { title: 'Soup', eatBy: today },
    ],
    today,
  ),
  [item('Soup', 0)],
  'a box with no usable title or date is skipped',
);
assert.equal(
  toDigestItems([{ title: 'x'.repeat(80), eatBy: today }], today)[0].name
    .length,
  40,
  'a long name is cut to 40 characters',
);
assert.ok(
  toDigestItems(
    [{ title: 'x'.repeat(80), eatBy: today }],
    today,
  )[0].name.endsWith('…'),
  'and says it was cut',
);

// What the push says
assert.equal(getDigestMessage([]), null, 'nothing due sends nothing');
assert.deepEqual(getDigestMessage([item('Chicken stock', -1)]), {
  title: 'Check your fridge and freezer',
  body: 'Chicken stock is past its date',
});
assert.equal(
  getDigestMessage([item('Chicken stock', -1), item('Chili', -1)])?.body,
  'Chicken stock and Chili are past their date',
  'two names are both named',
);
assert.equal(
  getDigestMessage(names(3, -1))?.body,
  'Dish A, Dish B and 1 more are past their date',
  'three are two names and one more',
);
assert.equal(
  getDigestMessage(names(12, -1))?.body,
  'Dish A, Dish B and 10 more are past their date',
  'twelve are two names and ten more',
);
assert.deepEqual(getDigestMessage([item('Adobo chicken', 0)]), {
  title: 'Eat soon',
  body: 'Adobo chicken is due today',
});
assert.equal(
  getDigestMessage([item('Adobo chicken', 1)])?.body,
  'Adobo chicken is due tomorrow',
);
assert.equal(
  getDigestMessage([item('Adobo chicken', 3)])?.body,
  'Adobo chicken is due in 3 days',
);
assert.equal(
  getDigestMessage([item('Chili', 1), item('Soup', 1)])?.body,
  'Chili and Soup are due tomorrow',
  'boxes due on one day say which day',
);
assert.equal(
  getDigestMessage([item('Chili', 0), item('Soup', 1), item('Rice', 1)])?.body,
  'Chili, Soup and 1 more are due soon',
  'boxes due on different days say soon',
);
assert.equal(
  getDigestMessage([
    item('Chicken stock', -1),
    item('Chili', 0),
    item('Soup', 1),
  ])?.body,
  'Chicken stock is past its date, and 2 more are due soon',
  'past its date leads and the rest is a count',
);
assert.equal(
  getDigestMessage([item('A', -1), item('B', -1), item('C', 0)])?.body,
  'A and B are past their date, and 1 more is due soon',
);
assert.equal(
  getDigestMessage([...names(2, -1), ...names(12, 0)])?.body,
  'Dish A and Dish B are past their date, and 12 more are due soon',
);
assert.equal(formatNames(names(1)), 'Dish A');
assert.doesNotMatch(
  [
    getDigestMessage(names(1, -1)),
    getDigestMessage(names(3, 0)),
    getDigestMessage([...names(2, -1), ...names(3, 1)]),
  ]
    .map((message) => `${message?.title} ${message?.body}`)
    .join(' '),
  /safe|spoil|fresh|bad|danger|sick/i,
  'the note names what is due and never says anything about safety',
);

// A package's window is the person's own lead days, and the note counts what the app calls due or past at that window
['America/Los_Angeles', 'Pacific/Auckland', 'UTC'].forEach((zone) => {
  process.env.TZ = zone;
  [Date.UTC(2026, 9, 18, 6, 30), Date.UTC(2026, 9, 18, 23, 30)].forEach(
    (now) => {
      const todayOf = dayToUtcMidnight(getLocalMoment(now, zone).day);
      [1, 2, 3].forEach((lead) => {
        [-3, -2, -1, 0, 1, 2, 3, 4, 5].forEach((offset) => {
          const expiresAt = todayOf + offset * DAY_MS;
          const { from, to } = getDigestBounds(todayOf, lead);
          assert.equal(
            expiresAt >= from && expiresAt <= to,
            getPackageState(expiresAt, now, lead) !== 'LATER' &&
              offset >= -DIGEST_PAST_DAYS,
            `${zone}, ${lead} lead days: the note counts a package the app calls due, plus the day just past (${offset})`,
          );
        });
      });
    },
  );
});

// Packages become one item per ingredient
const ingredient = (name: string, daysLeft: number): DigestItem => ({
  name,
  daysLeft,
  kind: 'ingredient',
});
assert.deepEqual(toPackageDigestItems([], today), []);
assert.deepEqual(
  toPackageDigestItems(
    [
      { ingredientName: 'Whole milk', expiresAt: today + DAY_MS },
      { ingredientName: 'whole  milk ', expiresAt: today },
      { ingredientName: 'Whole milk', expiresAt: today + 2 * DAY_MS },
      { ingredientName: 'Spinach', expiresAt: today - DAY_MS },
      { ingredientName: 'Cilantro', expiresAt: today + DAY_MS },
    ],
    today,
  ),
  [
    ingredient('Spinach', -1),
    ingredient('whole milk', 0),
    ingredient('Cilantro', 1),
  ],
  'three cartons of milk are one item at the nearest date, nearest first, then by name',
);
assert.deepEqual(
  toPackageDigestItems(
    [
      { ingredientName: 7, expiresAt: today },
      { ingredientName: ' ', expiresAt: today },
      { ingredientName: 'Rice', expiresAt: null },
      { ingredientName: 'Rice', expiresAt: 'soon' },
      { ingredientName: 'Rice', expiresAt: today },
    ],
    today,
  ),
  [ingredient('Rice', 0)],
  'a package with no usable name or date is skipped, so one with no date is never named',
);

// One list from every source
assert.deepEqual(mergeDigestItems([]), []);
assert.deepEqual(
  mergeDigestItems([
    [item('Chili', 1), item('Rice', 2)],
    [ingredient('Spinach', -1), ingredient('rice', 0)],
  ]),
  [ingredient('Spinach', -1), ingredient('rice', 0), item('Chili', 1)],
  'a dish and an ingredient with one name are one thing, at the nearer date',
);
assert.deepEqual(
  mergeDigestItems([[item('Rice', 1)], [ingredient('Rice', 1)]]),
  [item('Rice', 1)],
  'on the same day the dish keeps the name',
);
assert.deepEqual(
  mergeDigestItems([[ingredient('Rice', 1)], [item('Rice', 1)]]),
  [item('Rice', 1)],
  'whichever source comes first',
);

// What the push says once an ingredient is in it
assert.deepEqual(getDigestMessage([ingredient('Spinach', -1)]), {
  title: 'Check your kitchen',
  body: 'Spinach needs a look',
});
assert.equal(
  getDigestMessage([
    ingredient('Chicken stock', -1),
    ingredient('Spinach', 0),
    ingredient('Milk', 1),
    ingredient('Rice', 1),
  ])?.body,
  'Chicken stock, Spinach and 2 more need a look',
  'names stay capped at two',
);
assert.equal(
  getDigestMessage([item('Chili', 0), ingredient('Milk', 1)])?.body,
  'Chili and Milk need a look',
  'a dish and an ingredient are one note',
);
assert.equal(
  getDigestMessage([item('Chili', 0)])?.title,
  'Eat soon',
  'a note with only dishes says what it always said',
);
assert.equal(getDigestMessage([]), null);
assert.doesNotMatch(
  `${getDigestMessage([ingredient('Milk', -1)])?.title} ${getDigestMessage([ingredient('Milk', -1)])?.body}`,
  /safe|spoil|fresh|bad|danger|sick/i,
  'the note about ingredients never says anything about safety either',
);

// Where the note opens
assert.equal(
  getDigestLink([item('Chili', 0)]),
  '/pinch?tab=kitchen&open=fridge',
);
assert.equal(
  getDigestLink([ingredient('Milk', 0)]),
  '/pinch?tab=kitchen&open=pantry',
  'only ingredients open the pantry',
);
assert.equal(
  getDigestLink([ingredient('Milk', 0), item('Chili', 0)]),
  '/pinch?tab=kitchen&open=fridge',
  'a dish among them opens the fridge',
);

console.log('pinchDigest: all checks passed');
