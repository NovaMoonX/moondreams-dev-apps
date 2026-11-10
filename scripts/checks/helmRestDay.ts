import assert from 'node:assert/strict';

import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import {
  readRestDay,
  type RestDayEvent,
} from '../../src/apps/helm/engine/restDay.ts';

const LA = 'America/Los_Angeles';
const SHIFTS = 'acct/shifts';
const OTHER = 'acct/personal';

const event = (
  zone: string,
  from: [string, string],
  to: [string, string],
  extra: Partial<RestDayEvent> = {},
): RestDayEvent => ({
  startAt: zonedDateTimeToEpoch(from[0], from[1], zone),
  endAt: zonedDateTimeToEpoch(to[0], to[1], zone),
  isAllDay: false,
  isBusy: true,
  calendarKey: OTHER,
  ...extra,
});

const read = (
  dayKey: string,
  events: RestDayEvent[],
  options: { zone?: string; shifts?: string[] } = {},
) =>
  readRestDay({
    dayKey,
    timeZone: options.zone ?? LA,
    events,
    shiftCalendarIds: options.shifts ?? [],
  });

const D = '2026-11-10';
const P = '2026-11-09';

assert.equal(read(D, [event(LA, [P, '21:00'], [D, '03:00'])]), 'late');
assert.equal(read(D, [event(LA, [P, '21:00'], [D, '01:30'])]), null);
assert.equal(read(D, [event(LA, [P, '21:00'], [D, '02:00'])]), null);
assert.equal(read(D, [event(LA, [P, '21:00'], [D, '02:01'])]), 'late');
assert.equal(
  read(D, [event(LA, ['2026-11-08', '21:00'], [D, '03:00'])]),
  null,
  'an event that began two days back is not last night',
);
assert.equal(
  read(D, [event(LA, [P, '00:00'], [D, '03:00'], { isAllDay: true })]),
  null,
);
assert.equal(
  read(D, [event(LA, [P, '21:00'], [D, '03:00'], { isBusy: false })]),
  null,
);
assert.equal(
  read(D, [event(LA, [P, '21:00'], [D, '03:00'], { isBusy: null })]),
  'late',
);
assert.equal(read(D, []), null);

{
  const shifts = [SHIFTS];
  const concert = event(LA, [P, '21:00'], [D, '03:00']);
  const shift = event(LA, [P, '19:30'], [D, '07:30'], { calendarKey: SHIFTS });
  assert.equal(read(D, [concert], { shifts }), null);
  assert.equal(read(D, [shift], { shifts }), 'shift');
  assert.equal(read(D, [concert, shift], { shifts }), 'shift');
  assert.equal(read(D, [shift]), 'late');
  assert.equal(
    read(D, [event(LA, [P, '19:30'], [D, '07:30'], { calendarKey: null })], {
      shifts,
    }),
    null,
  );
}

{
  // Fall back: 2026-11-01 has 25 hours and 01:00 happens twice; 02:00 is still 02:00 on the clock.
  const fallBack = '2026-11-01';
  const before = '2026-10-31';
  assert.equal(
    read(fallBack, [event(LA, [before, '22:00'], [fallBack, '03:00'])]),
    'late',
  );
  assert.equal(
    read(fallBack, [event(LA, [before, '22:00'], [fallBack, '02:00'])]),
    null,
  );
  assert.equal(
    read(fallBack, [event(LA, [before, '22:00'], [fallBack, '01:45'])]),
    null,
  );
  const after = '2026-11-02';
  assert.equal(
    read(after, [event(LA, [fallBack, '20:00'], [after, '02:30'])]),
    'late',
  );
  assert.equal(
    read(after, [event(LA, [fallBack, '20:00'], [after, '01:59'])]),
    null,
  );
  assert.equal(
    read(after, [event(LA, [before, '20:00'], [after, '06:00'])]),
    null,
    'began two days back across the fall-back night',
  );
}

{
  const spring = '2026-03-08';
  const before = '2026-03-07';
  assert.equal(
    read(spring, [event(LA, [before, '22:00'], [spring, '03:30'])]),
    'late',
  );
}

{
  const TOKYO = 'Asia/Tokyo';
  assert.equal(
    read(D, [event(TOKYO, [P, '22:00'], [D, '02:30'])], { zone: TOKYO }),
    'late',
  );
  assert.equal(
    read(D, [event(TOKYO, [P, '22:00'], [D, '01:30'])], { zone: TOKYO }),
    null,
  );
  assert.equal(
    read(D, [event(TOKYO, [D, '05:00'], [D, '08:00'])], { zone: TOKYO }),
    null,
    'it is still the 9th in UTC, but began on the day itself where the person is',
  );
}

{
  // 23:00 on the 9th in Honolulu is already the 10th in UTC, so a UTC reading would call it the same day.
  const HONOLULU = 'Pacific/Honolulu';
  const late = event(HONOLULU, [P, '23:00'], [D, '03:00']);
  assert.equal(read(D, [late], { zone: HONOLULU }), 'late');
  assert.equal(
    read(D, [event(HONOLULU, [D, '00:30'], [D, '03:00'])], { zone: HONOLULU }),
    null,
    'an event that began on the day itself is not last night',
  );
  assert.equal(read(D, [late], { zone: 'Pacific/Auckland' }), null);
}

{
  assert.equal(
    read(D, [event(LA, [P, '09:00'], ['2026-11-16', '09:00'])]),
    null,
    'a week away is not a night out',
  );
  assert.equal(read(D, [event(LA, [P, '21:00'], [D, '11:59'])]), 'late');
  assert.equal(read(D, [event(LA, [P, '21:00'], [D, '12:30'])]), null);
}

console.log('check:helm-rest-day: rest day rules hold.');
