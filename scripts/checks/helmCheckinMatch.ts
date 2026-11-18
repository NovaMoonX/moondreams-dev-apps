// A said or typed check-in read on the device: each verb, a carer's habit, two habits that fit, extra words left for the model, and where the tick lands.
import assert from 'node:assert/strict';

import {
  CHECKIN_VERBS,
  checkInLine,
  matchCheckIn,
  resolveCheckIn,
  type CheckInHabit,
  type CheckInMatch,
} from '../../src/apps/helm/engine/checkInMatch.ts';
import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const LA = 'America/Los_Angeles';
const at = (day: string, time: string) => zonedDateTimeToEpoch(day, time, LA);
const START = Date.UTC(2026, 0, 1);

const habit = (
  id: string,
  name: string,
  extra: Partial<CheckInHabit> = {},
): CheckInHabit => ({
  id,
  name,
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {},
  windows: {},
  timesPerDay: null,
  startsOn: START,
  endsOn: null,
  forWhoId: null,
  isCare: false,
  ...extra,
});

const pills = habit('pills', 'Pills', {
  windowState: {
    m: { start: '08:00', end: '10:00', order: 0 },
    e: { start: '20:00', end: '22:00', order: 1 },
  },
  windows: { m: { label: 'Morning' }, e: { label: 'Evening' } },
});
const water = habit('water', 'Water', { timesPerDay: 6 });
const guitar = habit('guitar', 'Guitar', {
  cadence: { kind: 'timesPerWeek', count: 3 },
});
const floss = habit('floss', 'Floss', {
  windowState: { e: { start: '20:00', end: '22:00', order: 0 } },
  windows: { e: { label: 'Evening' } },
});
const metoprolol = habit('meto', 'Metoprolol', {
  forWhoId: 'mom',
  isCare: true,
  windowState: { m: { start: '08:00', end: '10:00', order: 0 } },
  windows: { m: { label: 'Morning' } },
});
const WHO = { mom: ['Mom', 'Mother'] };
const TODAY = [pills, water, guitar, floss, metoprolol];

const read = (text: string, habits: CheckInHabit[] = TODAY) =>
  matchCheckIn(text, habits, WHO);
const match = (habitId: string, windowId: string | null): CheckInMatch => ({
  kind: 'match',
  habitId,
  windowId,
});
const NONE: CheckInMatch = { kind: 'none' };

test('every verb takes the habit with no model: took, take, gave, done, did, had, finished, drank', () => {
  assert.deepEqual(
    [...CHECKIN_VERBS],
    ['took', 'take', 'gave', 'done', 'did', 'had', 'finished', 'drank'],
  );
  assert.deepEqual(read('I took my pills'), match('pills', null));
  assert.deepEqual(read('I take my pills'), match('pills', null));
  assert.deepEqual(read('gave Mom her metoprolol'), match('meto', null));
  assert.deepEqual(read('done water'), match('water', null));
  assert.deepEqual(read('did guitar'), match('guitar', null));
  assert.deepEqual(read('had a glass of water'), match('water', null));
  assert.deepEqual(read('finished the guitar'), match('guitar', null));
  assert.deepEqual(read('drank water!'), match('water', null));
  assert.deepEqual(read('Took My Pills.'), match('pills', null));
});

test('a window label said with the habit picks that window, and a label alone picks the habit that has it', () => {
  assert.deepEqual(read('took my evening pills'), match('pills', 'e'));
  assert.deepEqual(read('took pills this morning'), match('pills', 'm'));
  assert.deepEqual(read('took the morning'), match('pills', 'm'));
});

test('a carer habit needs her name: Mom, her, or the possessive; nobody else and no name is a no', () => {
  assert.deepEqual(read("gave Mom's metoprolol"), match('meto', null));
  assert.deepEqual(
    read('gave Mother her morning metoprolol'),
    match('meto', 'm'),
  );
  assert.deepEqual(read('took metoprolol'), NONE);
  assert.deepEqual(read('gave Dad her metoprolol'), NONE);
  assert.deepEqual(read('took my pills', [metoprolol]), NONE);
});

test('two habits that fit are ambiguous, never guessed', () => {
  assert.deepEqual(read('took the evening'), {
    kind: 'ambiguous',
    habitIds: ['pills', 'floss'],
  });
  assert.deepEqual(read('took my pills', [pills, habit('vitamins', 'Pills')]), {
    kind: 'ambiguous',
    habitIds: ['pills', 'vitamins'],
  });
  assert.deepEqual(read('took my evening pills'), match('pills', 'e'));
});

test('extra words, no verb, no habit or a refusal all go to the model', () => {
  assert.deepEqual(read('took my pills, felt dizzy'), NONE);
  assert.deepEqual(read('took my pills with the new water bottle'), NONE);
  assert.deepEqual(read('my pills'), NONE);
  assert.deepEqual(read('done'), NONE);
  assert.deepEqual(read('took the dog for a walk'), NONE);
  assert.deepEqual(read("didn't take my pills"), NONE);
  assert.deepEqual(read('took my pills and drank water'), NONE);
  assert.deepEqual(read(''), NONE);
  assert.deepEqual(read('took my pills', []), NONE);
});

test('a question or an order is never a check-in: a question mark, an opener, "take my X"', () => {
  assert.deepEqual(read('Did I take my pills?'), NONE);
  assert.deepEqual(read('did I take my pills'), NONE);
  assert.deepEqual(read('should I take my pills'), NONE);
  assert.deepEqual(read('can I take my pills'), NONE);
  assert.deepEqual(read('have I taken my pills'), NONE);
  assert.deepEqual(read('did Mom take her metoprolol'), NONE);
  assert.deepEqual(read('took my pills?'), NONE);
  assert.deepEqual(read('take my pills'), NONE);
  assert.deepEqual(read('take my pills please'), NONE);
  assert.deepEqual(read('did guitar'), match('guitar', null));
  assert.deepEqual(read('I take my pills'), match('pills', null));
});

test("the past or -ing form of a name's leading verb is a check-in on its own", () => {
  const practice = habit('practice', 'Practice guitar');
  const stretch = habit('stretch', 'Stretch for ten minutes');
  const both = [practice, stretch];
  assert.deepEqual(read('practised guitar', both), match('practice', null));
  assert.deepEqual(read('I practiced guitar', both), match('practice', null));
  assert.deepEqual(read('practicing guitar', both), match('practice', null));
  assert.deepEqual(read('practiced', both), match('practice', null));
  assert.deepEqual(read('stretched', both), match('stretch', null));
  assert.deepEqual(read('I stretched', both), match('stretch', null));
  assert.deepEqual(read('practice guitar', both), NONE);
  assert.deepEqual(
    read('stretched for ten minutes', both),
    match('stretch', null),
  );
  assert.deepEqual(read('stretched and felt great', both), NONE);
});

test('a medicine word matches a care habit, a carer needs her name, two care habits are ambiguous', () => {
  const sertraline = habit('sert', 'Sertraline', { isCare: true });
  const lisinopril = habit('lisin', 'Lisinopril', { isCare: true });
  assert.deepEqual(read('took my pills', [sertraline]), match('sert', null));
  assert.deepEqual(read('took my meds', [sertraline]), match('sert', null));
  assert.deepEqual(
    read('took my medication', [sertraline]),
    match('sert', null),
  );
  assert.deepEqual(read('took my tablets', [sertraline]), match('sert', null));
  assert.deepEqual(read('took my medicine', [sertraline]), match('sert', null));
  assert.deepEqual(read('took my pills', [sertraline, lisinopril]), {
    kind: 'ambiguous',
    habitIds: ['sert', 'lisin'],
  });
  assert.deepEqual(
    read('Mom took her pills', [sertraline, metoprolol]),
    match('meto', null),
  );
  assert.deepEqual(
    read('took my pills', [sertraline, metoprolol]),
    match('sert', null),
  );
  assert.deepEqual(read('took my pills', [metoprolol]), NONE);
  assert.deepEqual(read('took my pills', [habit('vit', 'Vitamins')]), NONE);
  assert.deepEqual(read('took my pills and felt sick', [sertraline]), NONE);
});

const day = (checks: Record<string, unknown> = {}, count = 0) => ({
  checks,
  count,
});

test('the tick lands in the open window, else the nearest earlier unticked one, else the next one to come, never the day', () => {
  const on = (time: string, entry = day(), windowId: string | null = null) =>
    resolveCheckIn(pills, windowId, at('2026-11-08', time), LA, entry);
  const landed = (result: ReturnType<typeof on>) =>
    result.kind === 'write' && result.effect.kind === 'tick'
      ? result.effect.windowId
      : result.kind;
  assert.equal(landed(on('09:45')), 'm');
  assert.equal(landed(on('21:00', day({ m: { status: 'done' } }))), 'e');
  assert.equal(landed(on('15:00')), 'm');
  assert.equal(landed(on('15:00', day({ m: { status: 'done' } }))), 'e');
  assert.equal(landed(on('06:30')), 'm');
  assert.equal(landed(on('04:00')), 'm');
  assert.equal(landed(on('04:00', day({ m: { status: 'done' } }))), 'e');
  assert.equal(landed(on('09:00', day(), 'e')), 'e');
  assert.equal(
    landed(on('21:00', day({ m: { status: 'done' }, e: { status: 'done' } }))),
    'alreadyDone',
  );
  assert.equal(
    landed(on('09:00', day({ m: { status: 'done' } }), 'm')),
    'alreadyDone',
  );
  assert.equal(
    landed(on('09:00', day({ m: { status: 'skipped' } }), 'm')),
    'm',
  );
});

test('the result line says what was ticked, and a late-night tick counts for the evening before', () => {
  const morning = resolveCheckIn(
    pills,
    null,
    at('2026-11-08', '09:45'),
    LA,
    day(),
  );
  assert.equal(
    morning.kind === 'write' && morning.line,
    'Done. Morning pills ticked.',
  );
  const evening = resolveCheckIn(
    pills,
    'e',
    at('2026-11-08', '21:00'),
    LA,
    day({ m: { status: 'done' } }),
  );
  assert.equal(
    evening.kind === 'write' && evening.line,
    'Done. Evening pills ticked.',
  );
  const late = resolveCheckIn(
    pills,
    null,
    at('2026-11-09', '01:30'),
    LA,
    day({ m: { status: 'done' } }),
  );
  assert.equal(late.kind, 'write');
  assert.deepEqual(late.kind === 'write' && late.effect, {
    kind: 'tick',
    habitId: 'pills',
    dayKey: '2026-11-08',
    windowId: 'e',
    at: at('2026-11-09', '01:30'),
  });
  const plain = resolveCheckIn(
    guitar,
    null,
    at('2026-11-08', '17:00'),
    LA,
    null,
  );
  assert.equal(plain.kind === 'write' && plain.line, 'Done. Guitar ticked.');
  assert.equal(
    plain.kind === 'write' &&
      plain.effect.kind === 'tick' &&
      plain.effect.windowId,
    'day',
  );
});

test('a care tick names the medicine and whose it is, anything else reads as before', () => {
  const tick = (
    target: CheckInHabit,
    care: { whoName: string | null; medicine: string | null } | null,
    entry: ReturnType<typeof day> | null = day(),
  ) => resolveCheckIn(target, 'm', at('2026-11-08', '09:00'), LA, entry, care);
  const lineOf = (result: ReturnType<typeof tick>) => result.line;
  assert.equal(
    lineOf(tick(metoprolol, { whoName: 'Mom', medicine: 'Metoprolol' })),
    "Done: Mom's morning metoprolol.",
  );
  assert.equal(
    lineOf(tick(metoprolol, { whoName: null, medicine: 'Metoprolol' })),
    'Done: morning metoprolol.',
  );
  assert.equal(
    lineOf(tick(metoprolol, { whoName: 'Mom', medicine: null })),
    "Done: Mom's morning metoprolol.",
  );
  const ownPills = habit('own', 'Evening pills', {
    isCare: true,
    windowState: { m: { start: '08:00', end: '10:00', order: 0 } },
    windows: { m: { label: 'Morning' } },
  });
  assert.equal(
    lineOf(tick(ownPills, { whoName: null, medicine: 'Lisinopril' })),
    'Done: morning lisinopril.',
  );
  assert.equal(
    lineOf(tick(ownPills, { whoName: null, medicine: null })),
    'Done: morning evening pills.',
  );
  assert.equal(
    lineOf(
      tick(
        metoprolol,
        { whoName: 'Mom', medicine: 'Metoprolol' },
        day({ m: { status: 'done' } }),
      ),
    ),
    "Mom's morning metoprolol already ticked.",
  );
  assert.equal(
    lineOf(tick(pills, { whoName: null, medicine: 'Vitamin D' })),
    'Done. Morning pills ticked.',
  );
  assert.equal(
    checkInLine('done', pills, 'e', null),
    'Done. Evening pills ticked.',
  );
  assert.equal(
    checkInLine('done', metoprolol, null, {
      whoName: 'Mom',
      medicine: 'Metoprolol',
    }),
    "Done: Mom's metoprolol.",
  );
});

test('a tally adds one and says where it stands, past its number too', () => {
  const next = (count: number) =>
    resolveCheckIn(water, null, at('2026-11-08', '12:00'), LA, day({}, count));
  const third = next(2);
  assert.equal(third.kind === 'write' && third.line, '3 of 6 water');
  assert.equal(
    third.kind === 'write' &&
      third.effect.kind === 'tally' &&
      third.effect.count,
    3,
  );
  const past = next(6);
  assert.equal(past.kind === 'write' && past.line, '7 water today');
});

test('a retired, ended or paused habit writes nothing and says so', () => {
  ['retired', 'ended', 'paused'].forEach((status) => {
    const result = resolveCheckIn(
      { ...pills, status },
      null,
      at('2026-11-08', '09:45'),
      LA,
      day(),
    );
    assert.equal(result.kind, 'notActive');
    assert.equal(result.kind === 'notActive' && result.status, status);
  });
  const retired = resolveCheckIn(
    { ...pills, name: 'Evening walk', status: 'retired' },
    null,
    0,
    LA,
    null,
  );
  assert.equal(
    retired.kind === 'notActive' && retired.line,
    'Your evening walk is retired. Say "bring back evening walk" to start it again.',
  );
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
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
