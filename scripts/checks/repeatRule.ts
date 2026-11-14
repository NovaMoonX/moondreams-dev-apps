// The repeat rule: wording, caps, parsing, skipped/moved, and our iterator against `rrule` (a dev-only oracle) over generated rules.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import rrulePackage from 'rrule';
import type { Weekday as RRuleWeekday } from 'rrule';

import {
  REPEAT_CAPS,
  checkRepeatRule,
  describeRepeat,
  formatRepeatRule,
  listOccurrences,
  localeWeekStart,
  nextOccurrence,
  parseRepeatRule,
  repeatFromParts,
  repeatPresets,
  type RepeatParts,
  type RepeatRule,
  type Weekday,
} from '../../src/utils/repeatRule.ts';

const { RRule } = rrulePackage;
const realNow = Date.now;
Date.now = () => Date.UTC(2026, 10, 14, 12);

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const SUN = '2026-11-29';
const parse = (text: string) => {
  const rule = parseRepeatRule(text);
  assert.ok(rule, `${text} should parse`);
  return rule;
};
const parts = (extra: Partial<RepeatParts>): RepeatParts => ({
  freq: 'weekly',
  interval: 1,
  weekdays: [],
  monthBy: null,
  nth: null,
  endsKind: 'never',
  until: null,
  count: null,
  ...extra,
});

test('presets from Sun 2026-11-29', () => {
  const presets = repeatPresets(SUN);
  assert.deepEqual(
    presets.map((p) => [p.label, p.detail]),
    [
      ['Does not repeat', 'Runs once, Sun, Nov 29'],
      ['Every day', null],
      ['Every weekday', 'Monday to Friday'],
      ['Every week on Sunday', null],
      ['Every month on the 29th', 'Months without a 29th are skipped'],
      ['Every month on the last Sunday', null],
      ['Every year on Nov 29', null],
    ],
  );
  assert.equal(presets[0].rule, null);
  assert.equal(
    formatRepeatRule(presets[2].rule!),
    'FREQ=WEEKLY;WKST=SU;BYDAY=MO,TU,WE,TH,FR',
  );
});

test('presets: 1st to 28th says the nth weekday, no skipped note', () => {
  const labels = repeatPresets('2026-11-23').map((p) => [p.label, p.detail]);
  assert.deepEqual(labels[4], ['Every month on the 23rd', null]);
  assert.deepEqual(labels[5], ['Every month on the fourth Monday', null]);
  assert.equal(repeatPresets('2026-11-01')[4].label, 'Every month on the 1st');
  assert.equal(repeatPresets('2026-11-02')[4].label, 'Every month on the 2nd');
  assert.equal(repeatPresets('2026-11-03')[4].label, 'Every month on the 3rd');
  assert.equal(repeatPresets('2026-11-11')[4].label, 'Every month on the 11th');
});

test('presets: last day only on a month end; a year other than this one is shown', () => {
  const nov30 = repeatPresets('2026-11-30').map((p) => p.label);
  assert.deepEqual(nov30.slice(4), [
    'Every month on the 30th',
    'Every month on the last Monday',
    'Every month on the last day',
    'Every year on Nov 30',
  ]);
  assert.ok(!repeatPresets(SUN).some((p) => p.key === 'monthlyLastDay'));
  assert.equal(
    repeatPresets('2027-03-07')[0].detail,
    'Runs once, Sun, Mar 7, 2027',
  );
  assert.equal(
    repeatPresets('2028-02-29').find((p) => p.key === 'yearly')?.detail,
    'Only in leap years',
  );
});

test('describeRepeat wordings', () => {
  const at = { time: '18:00' };
  const weekly = repeatFromParts(parts({ weekdays: ['SU'] }), SUN)!;
  assert.equal(
    describeRepeat(weekly, SUN, at),
    'Every week on Sunday at 6:00 PM',
  );
  assert.equal(describeRepeat(weekly, SUN), 'Every week on Sunday');
  const custom = repeatFromParts(
    parts({
      interval: 2,
      weekdays: ['WE', 'SU'],
      endsKind: 'on',
      until: '2027-02-28',
    }),
    SUN,
  )!;
  assert.equal(
    describeRepeat(custom, SUN, at),
    'Every 2 weeks on Sunday and Wednesday at 6:00 PM, until Sun, Feb 28',
  );
  assert.equal(
    describeRepeat({ ...custom, until: null, count: 10 }, SUN, at),
    'Every 2 weeks on Sunday and Wednesday at 6:00 PM, 10 times',
  );
  assert.equal(
    describeRepeat({ ...custom, until: null }, SUN, at),
    'Every 2 weeks on Sunday and Wednesday at 6:00 PM',
  );
  const month29 = repeatFromParts(
    parts({ freq: 'monthly', monthBy: 'day' }),
    SUN,
  )!;
  assert.equal(
    describeRepeat(month29, SUN, at),
    'Every month on the 29th at 6:00 PM (months without one are skipped)',
  );
  const weekdays = repeatFromParts(
    parts({
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
      endsKind: 'on',
      until: '2027-03-31',
    }),
    SUN,
  )!;
  assert.equal(
    describeRepeat(weekdays, SUN, { time: '07:00' }),
    'Every weekday at 7:00 AM, until Wed, Mar 31',
  );
  const yearly = repeatFromParts(parts({ freq: 'yearly' }), SUN)!;
  assert.equal(
    describeRepeat(yearly, SUN, at),
    'Every year on Nov 29 at 6:00 PM',
  );
  assert.equal(describeRepeat(null, SUN, at), 'Does not repeat');
  const lastSunday = repeatFromParts(
    parts({ freq: 'monthly', monthBy: 'nthWeekday' }),
    SUN,
  )!;
  assert.equal(
    describeRepeat(lastSunday, SUN),
    'Every month on the last Sunday',
  );
  const lastDay = repeatFromParts(
    parts({ freq: 'monthly', monthBy: 'lastDay' }),
    SUN,
  )!;
  assert.equal(describeRepeat(lastDay, SUN), 'Every month on the last day');
  const days = repeatFromParts(parts({ freq: 'daily', interval: 3 }), SUN)!;
  assert.equal(describeRepeat(days, SUN), 'Every 3 days');
  assert.equal(
    describeRepeat(days, SUN, { time: '09:05', timeFormat: (t) => `[${t}]` }),
    'Every 3 days at [09:05]',
  );
  assert.equal(
    describeRepeat({ ...days, count: 1 }, SUN),
    'Every 3 days, 1 time',
  );
});

test('weekly order of days follows weekStart', () => {
  const monday = repeatFromParts(
    parts({ weekdays: ['SU', 'MO', 'WE'] }),
    SUN,
    'MO',
  )!;
  assert.deepEqual(monday.weekdays, ['MO', 'WE', 'SU']);
  assert.equal(
    describeRepeat(monday, SUN),
    'Every week on Monday, Wednesday and Sunday',
  );
  assert.equal(formatRepeatRule(monday), 'FREQ=WEEKLY;WKST=MO;BYDAY=MO,WE,SU');
  const sunday = repeatFromParts(
    parts({ weekdays: ['MO', 'SU', 'WE'] }),
    SUN,
    'SU',
  )!;
  assert.deepEqual(sunday.weekdays, ['SU', 'MO', 'WE']);
});

test('caps: every error', () => {
  const rule = repeatFromParts(parts({ weekdays: ['SU'] }), SUN)!;
  const check = (r: RepeatRule, today = '2026-11-14') =>
    checkRepeatRule(r, SUN, today);
  assert.equal(check(rule), null);
  assert.equal(check({ ...rule, interval: 0 }), 'tooOften');
  assert.equal(check({ ...rule, interval: 53 }), 'interval');
  assert.equal(check({ ...rule, interval: 52 }), null);
  assert.equal(
    check({ ...rule, freq: 'daily', weekdays: [], interval: 366 }),
    'interval',
  );
  assert.equal(
    check({
      ...rule,
      freq: 'monthly',
      interval: 13,
      weekdays: [],
      monthBy: 'day',
      monthDay: 3,
    }),
    'interval',
  );
  assert.equal(
    check({ ...rule, freq: 'yearly', interval: 11, weekdays: [] }),
    'interval',
  );
  assert.equal(check({ ...rule, count: 1000 }), 'count');
  assert.equal(check({ ...rule, count: 0 }), 'count');
  assert.equal(check({ ...rule, count: 999 }), null);
  assert.equal(check({ ...rule, until: '2026-11-28' }), 'untilBeforeStart');
  assert.equal(check({ ...rule, until: SUN }), null);
  assert.equal(
    check({ ...rule, until: '2026-12-01' }, '2026-12-02'),
    'neverComes',
  );
  assert.equal(check({ ...rule, count: 2 }, '2026-12-07'), 'neverComes');
  assert.equal(check({ ...rule, weekdays: [] }), 'shape');
  assert.equal(check({ ...rule, count: 3, until: '2027-01-01' }), 'shape');
  assert.equal(check({ ...rule, monthBy: 'day' }), 'shape');
  assert.equal(check({ ...rule, weekdays: ['SU', 'SU'] }), 'shape');
});

test('parse and format round trip', () => {
  const texts = [
    'FREQ=DAILY;WKST=SU',
    'FREQ=DAILY;INTERVAL=365;WKST=MO;COUNT=999',
    'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU,WE;UNTIL=20270228',
    'FREQ=WEEKLY;WKST=MO;BYDAY=MO,TU,WE,TH,FR',
    'FREQ=MONTHLY;WKST=SU;BYMONTHDAY=29',
    'FREQ=MONTHLY;INTERVAL=12;WKST=SU;BYMONTHDAY=-1;COUNT=5',
    'FREQ=MONTHLY;WKST=SU;BYDAY=-1SU',
    'FREQ=MONTHLY;WKST=SA;BYDAY=4MO;UNTIL=20301231',
    'FREQ=YEARLY;INTERVAL=10;WKST=SU',
  ];
  texts.forEach((text) => {
    const rule = parse(text);
    assert.equal(formatRepeatRule(rule), text);
    assert.deepEqual(parseRepeatRule(formatRepeatRule(rule)), rule);
  });
  assert.equal(
    formatRepeatRule(parse('RRULE:FREQ=DAILY')),
    'FREQ=DAILY;WKST=MO',
  );
  assert.equal(
    formatRepeatRule(parse('FREQ=WEEKLY;BYDAY=WE,SU;WKST=SU')),
    'FREQ=WEEKLY;WKST=SU;BYDAY=SU,WE',
  );
});

test('parse refuses rules outside the subset', () => {
  [
    'FREQ=HOURLY',
    'FREQ=MINUTELY',
    'FREQ=SECONDLY',
    'FREQ=DAILY;BYHOUR=8',
    'FREQ=DAILY;INTERVAL=366',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;INTERVAL=1.5',
    'FREQ=WEEKLY;INTERVAL=53;BYDAY=MO',
    'FREQ=MONTHLY;INTERVAL=13;BYMONTHDAY=3',
    'FREQ=YEARLY;INTERVAL=11',
    'FREQ=WEEKLY',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=WEEKLY;BYDAY=MO,MO',
    'FREQ=WEEKLY;BYDAY=XX',
    'FREQ=MONTHLY',
    'FREQ=MONTHLY;BYDAY=MO',
    'FREQ=MONTHLY;BYDAY=1MO,3MO',
    'FREQ=MONTHLY;BYDAY=5MO',
    'FREQ=MONTHLY;BYDAY=-2MO',
    'FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1',
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'FREQ=MONTHLY;BYMONTHDAY=32',
    'FREQ=MONTHLY;BYMONTHDAY=-2',
    'FREQ=MONTHLY;BYMONTHDAY=0',
    'FREQ=MONTHLY;BYMONTHDAY=3;BYDAY=1MO',
    'FREQ=DAILY;BYDAY=MO',
    'FREQ=YEARLY;BYMONTH=3',
    'FREQ=YEARLY;BYWEEKNO=3',
    'FREQ=DAILY;UNTIL=20270101;COUNT=3',
    'FREQ=DAILY;UNTIL=20271301',
    'FREQ=DAILY;UNTIL=20270101T000000Z',
    'FREQ=DAILY;COUNT=0',
    'FREQ=DAILY;COUNT=1000',
    'FREQ=DAILY;WKST=XX',
    'FREQ=DAILY;FREQ=DAILY',
    'FREQ=DAILY;TZID=UTC',
    'DTSTART=20261129;FREQ=DAILY',
    'DTSTART;TZID=America/Los_Angeles:20261129T180000',
    'FREQ=DAILY;',
    '',
    'every day',
  ].forEach((text) => assert.equal(parseRepeatRule(text), null, text));
});

test('skipped and moved', () => {
  const rule = parse('FREQ=WEEKLY;WKST=SU;BYDAY=SU');
  const list = (extra = {}) =>
    listOccurrences(rule, SUN, { limit: 4, ...extra });
  assert.deepEqual(list(), [
    '2026-11-29',
    '2026-12-06',
    '2026-12-13',
    '2026-12-20',
  ]);
  assert.deepEqual(list({ skipped: ['2026-12-06'] }), [
    '2026-11-29',
    '2026-12-13',
    '2026-12-20',
    '2026-12-27',
  ]);
  assert.deepEqual(
    list({ moved: { '2026-12-06': { day: '2026-12-08', time: '07:00' } } }),
    ['2026-11-29', '2026-12-08', '2026-12-13', '2026-12-20'],
  );
  assert.deepEqual(list({ fromDay: '2026-12-07' }), [
    '2026-12-13',
    '2026-12-20',
    '2026-12-27',
    '2027-01-03',
  ]);
  assert.equal(nextOccurrence(rule, SUN, { fromDay: SUN }), SUN);
  assert.equal(
    nextOccurrence(rule, SUN, { fromDay: SUN, skipped: [SUN] }),
    '2026-12-06',
  );
  assert.equal(
    nextOccurrence(rule, SUN, {
      fromDay: '2026-12-07',
      skipped: ['2026-12-13'],
    }),
    '2026-12-20',
  );
  assert.deepEqual(listOccurrences(null, SUN, { limit: 5 }), [SUN]);
  assert.deepEqual(
    listOccurrences(null, SUN, { limit: 5, fromDay: '2026-12-01' }),
    [],
  );
  assert.deepEqual(
    listOccurrences(null, SUN, { limit: 5, skipped: [SUN] }),
    [],
  );
  assert.equal(nextOccurrence(null, SUN, { fromDay: '2026-12-01' }), null);
});

test('COUNT counts skipped occurrences', () => {
  const rule = parse('FREQ=DAILY;WKST=SU;COUNT=5');
  assert.deepEqual(
    listOccurrences(rule, '2026-11-01', {
      limit: 20,
      skipped: ['2026-11-02', '2026-11-03'],
    }),
    ['2026-11-01', '2026-11-04', '2026-11-05'],
  );
  assert.equal(
    nextOccurrence(rule, '2026-11-01', { fromDay: '2026-11-06' }),
    null,
  );
});

test('UNTIL is inclusive', () => {
  const rule = parse('FREQ=DAILY;WKST=SU;UNTIL=20261103');
  assert.deepEqual(listOccurrences(rule, '2026-11-01', { limit: 20 }), [
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
  ]);
});

test('31st skips short months; last day does not', () => {
  const rule = parse('FREQ=MONTHLY;WKST=SU;BYMONTHDAY=31');
  assert.deepEqual(listOccurrences(rule, '2026-01-31', { limit: 6 }), [
    '2026-01-31',
    '2026-03-31',
    '2026-05-31',
    '2026-07-31',
    '2026-08-31',
    '2026-10-31',
  ]);
  const last = parse('FREQ=MONTHLY;WKST=SU;BYMONTHDAY=-1');
  assert.deepEqual(listOccurrences(last, '2027-01-31', { limit: 4 }), [
    '2027-01-31',
    '2027-02-28',
    '2027-03-31',
    '2027-04-30',
  ]);
  const count = parse('FREQ=MONTHLY;WKST=SU;BYMONTHDAY=31;COUNT=3');
  assert.deepEqual(listOccurrences(count, '2026-01-31', { limit: 9 }), [
    '2026-01-31',
    '2026-03-31',
    '2026-05-31',
  ]);
});

test('Feb 29 yearly comes only in leap years', () => {
  const rule = parse('FREQ=YEARLY;WKST=SU');
  assert.deepEqual(listOccurrences(rule, '2028-02-29', { limit: 4 }), [
    '2028-02-29',
    '2032-02-29',
    '2036-02-29',
    '2040-02-29',
  ]);
  assert.deepEqual(listOccurrences(rule, '2096-02-29', { limit: 3 }), [
    '2096-02-29',
    '2104-02-29',
    '2108-02-29',
  ]);
});

test('nth weekdays and a first day that is not on the rule', () => {
  const fourth = parse('FREQ=MONTHLY;WKST=SU;BYDAY=4MO');
  assert.deepEqual(listOccurrences(fourth, '2026-11-23', { limit: 3 }), [
    '2026-11-23',
    '2026-12-28',
    '2027-01-25',
  ]);
  const last = parse('FREQ=MONTHLY;WKST=SU;BYDAY=-1SU');
  assert.deepEqual(listOccurrences(last, SUN, { limit: 3 }), [
    '2026-11-29',
    '2026-12-27',
    '2027-01-31',
  ]);
  const weekly = parse('FREQ=WEEKLY;WKST=SU;BYDAY=MO');
  assert.equal(nextOccurrence(weekly, SUN, { fromDay: SUN }), '2026-11-30');
});

test('repeatFromParts', () => {
  assert.equal(repeatFromParts(parts({ freq: null }), SUN), null);
  assert.equal(repeatFromParts(parts({ endsKind: 'on' }), SUN), null);
  assert.equal(repeatFromParts(parts({ endsKind: 'after' }), SUN), null);
  const rule = repeatFromParts(
    parts({ freq: 'monthly', monthBy: 'nthWeekday', nth: 2, weekdays: ['TU'] }),
    SUN,
  )!;
  assert.equal(formatRepeatRule(rule), 'FREQ=MONTHLY;WKST=SU;BYDAY=2TU');
  assert.equal(
    formatRepeatRule(
      repeatFromParts(
        parts({ freq: 'weekly', endsKind: 'after', count: 4 }),
        SUN,
      )!,
    ),
    'FREQ=WEEKLY;WKST=SU;BYDAY=SU;COUNT=4',
  );
  assert.equal(
    formatRepeatRule(
      repeatFromParts(parts({ freq: 'monthly', monthBy: 'lastDay' }), SUN)!,
    ),
    'FREQ=MONTHLY;WKST=SU;BYMONTHDAY=-1',
  );
  assert.equal(
    formatRepeatRule(
      repeatFromParts(parts({ freq: 'monthly', monthBy: 'day' }), SUN)!,
    ),
    'FREQ=MONTHLY;WKST=SU;BYMONTHDAY=29',
  );
});

test('localeWeekStart', () => {
  assert.equal(localeWeekStart('en-US'), 'SU');
  assert.equal(localeWeekStart('de-DE'), 'MO');
  assert.equal(localeWeekStart('not a locale!!'), 'SU');
});

test('caps table', () => {
  assert.deepEqual(REPEAT_CAPS, {
    daily: 365,
    weekly: 52,
    monthly: 12,
    yearly: 10,
    count: 999,
  });
});

const unitCaseCount = tests.length;

const DAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const R_DAYS = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];
const R_FREQ = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
} as const;
const ORACLE_RULES = 4000;

function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

test(`oracle: ${ORACLE_RULES} generated rules against rrule`, () => {
  const random = makeRandom(106);
  const int = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[int(0, items.length - 1)];
  const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const leapStarts = ['2024-02-29', '2028-02-29', '2096-02-29', '2027-02-28'];

  Array.from({ length: ORACLE_RULES }).forEach((_, index) => {
    const freq = pick(['daily', 'weekly', 'monthly', 'yearly'] as const);
    const startMs = Date.UTC(int(2024, 2031), int(0, 11), int(1, 31));
    const start =
      freq === 'yearly' && random() < 0.3 ? pick(leapStarts) : key(startMs);
    const startDate = new Date(`${start}T00:00:00Z`);
    const weekStart = pick(DAYS);
    const weekdays = Array.from(
      new Set(Array.from({ length: int(1, 7) }, () => pick(DAYS))),
    );
    const monthBy = pick(['day', 'nthWeekday', 'lastDay'] as const);
    const endsKind = pick(['never', 'never', 'on', 'after'] as const);
    const until = key(startDate.getTime() + int(0, 900) * 86_400_000);
    const rule = repeatFromParts(
      {
        freq,
        interval: int(
          1,
          freq === 'daily'
            ? 12
            : freq === 'weekly'
              ? 6
              : freq === 'monthly'
                ? 12
                : 10,
        ),
        weekdays: freq === 'monthly' ? [pick(DAYS)] : weekdays,
        monthBy: freq === 'monthly' ? monthBy : null,
        nth: pick([1, 2, 3, 4, -1] as const),
        endsKind,
        until,
        count: int(1, 60),
      },
      start,
      weekStart,
    );
    assert.ok(rule, `rule ${index}`);
    assert.ok(
      [null, 'neverComes'].includes(checkRepeatRule(rule, start, '2020-01-01')),
      formatRepeatRule(rule),
    );
    assert.deepEqual(parseRepeatRule(formatRepeatRule(rule)), rule);

    const byMonthDay =
      freq === 'monthly' && rule.monthBy === 'day' ? rule.monthDay! : undefined;
    const rrule = new RRule({
      freq: R_FREQ[freq],
      interval: rule.interval,
      wkst: R_DAYS[DAYS.indexOf(rule.weekStart)],
      dtstart: startDate,
      byweekday:
        freq === 'weekly'
          ? rule.weekdays.map((day) => R_DAYS[DAYS.indexOf(day)])
          : freq === 'monthly' && rule.monthBy === 'nthWeekday'
            ? [
                (R_DAYS[DAYS.indexOf(rule.nthWeekday!)] as RRuleWeekday).nth(
                  rule.nth!,
                ),
              ]
            : undefined,
      bymonthday: byMonthDay,
      until: rule.until ? new Date(`${rule.until}T00:00:00Z`) : undefined,
      count: rule.count ?? undefined,
    });
    const expected = rrule
      .all((_date, position) => position < 50)
      .map((date) => key(date.getTime()));
    const ours = listOccurrences(rule, start, { limit: 50 });
    assert.deepEqual(ours, expected, `${formatRepeatRule(rule)} from ${start}`);
  });
});

test('no file under src or functions/src imports rrule', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === 'node_modules' || name === 'lib') return [];
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const offenders = ['src', 'functions/src']
    .flatMap(walk)
    .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
    .filter((path) =>
      /(from|import\()\s*['"]rrule['"]|require\(\s*['"]rrule['"]\s*\)/.test(
        readFileSync(path, 'utf8'),
      ),
    );
  assert.deepEqual(offenders, []);
});

const failures = tests.flatMap(([name, run]) => {
  try {
    run();
    console.log(`ok   ${name}`);
    return [];
  } catch (error) {
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
    return [name];
  }
});
Date.now = realNow;
console.log(
  `${tests.length - failures.length}/${tests.length} passed (${unitCaseCount} fixture groups, ${ORACLE_RULES} oracle rules)`,
);
process.exit(failures.length ? 1 : 0);
