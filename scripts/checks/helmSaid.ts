// What was said: another person's health masked from a quote, closed tags, 3 different days in 14, mixed signals raising nothing, a care habit only asked, and a smaller step never below once a week.
import assert from 'node:assert/strict';

import {
  OBSERVATION_TAGS,
  STRUGGLING_TAGS,
  WORKING_TAGS,
  maskOthersHealth,
  readSaidSignals,
  type SaidObservation,
} from '../../src/apps/helm/engine/said.ts';
import {
  lowerCadence,
  raiseCadence,
  readHandling,
  readSaidCandidates,
} from '../../src/apps/helm/engine/patterns.ts';

let failures = 0;
const test = (name: string, run: () => void) => {
  try {
    run();
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
};

const TODAY = '2026-11-16';
const said = (
  id: string,
  dayKey: string,
  tags: string[],
  extra: Partial<SaidObservation> = {},
): SaidObservation => ({
  id,
  subject: { collection: 'habits', id: 'h1' },
  dayKey,
  at: Date.parse(`${dayKey}T18:00:00Z`),
  tags,
  isCare: false,
  ...extra,
});

test('another person with a health word is masked', () => {
  assert.equal(
    maskOthersHealth("Maya's having a panic attack", ['Maya']),
    null,
  );
  assert.equal(
    maskOthersHealth('I had a panic attack', ['Maya']),
    'I had a panic attack',
  );
  assert.equal(
    maskOthersHealth('Maya came over for piano', ['Maya']),
    'Maya came over for piano',
  );
  assert.equal(maskOthersHealth('Maya took her pill', ['Maya']), null);
});

test('the tag set is closed and split both ways', () => {
  assert.equal(STRUGGLING_TAGS.length, 6);
  assert.equal(WORKING_TAGS.length, 5);
  assert.ok(OBSERVATION_TAGS.includes('bodyEffect'));
  assert.ok(!(STRUGGLING_TAGS as readonly string[]).includes('bodyEffect'));
});

test('three different days are a signal, three mentions in one day are not', () => {
  const days = [
    said('a', '2026-11-10', ['tired']),
    said('b', '2026-11-12', ['reluctant']),
    said('c', '2026-11-15', ['tooBusy']),
  ];
  assert.equal(readSaidSignals(days, 'h1', 0, TODAY)?.kind, 'struggling');
  const oneDay = ['a', 'b', 'c'].map((id) => said(id, '2026-11-10', ['tired']));
  assert.equal(readSaidSignals(oneDay, 'h1', 0, TODAY), null);
});

test('working signals read the same way', () => {
  const days = ['2026-11-09', '2026-11-11', '2026-11-14'].map((day, at) =>
    said(`w${at}`, day, ['enjoyed']),
  );
  assert.equal(readSaidSignals(days, 'h1', 0, TODAY)?.kind, 'working');
});

test('mixed signals, old days, an earlier since and paused days raise nothing', () => {
  const days = [
    said('a', '2026-11-10', ['tired']),
    said('b', '2026-11-12', ['tired']),
    said('c', '2026-11-15', ['tired']),
  ];
  assert.equal(
    readSaidSignals(
      [...days, said('d', '2026-11-13', ['enjoyed'])],
      'h1',
      0,
      TODAY,
    ),
    null,
  );
  assert.equal(readSaidSignals(days, 'h1', days[2].at, TODAY), null);
  assert.equal(
    readSaidSignals(days, 'h1', 0, TODAY, (key) => key === '2026-11-12'),
    null,
  );
  assert.equal(readSaidSignals(days, 'h1', 0, '2026-12-10'), null);
});

test('bodyEffect is never a signal', () => {
  const days = ['2026-11-10', '2026-11-12', '2026-11-15'].map((day, at) =>
    said(`b${at}`, day, ['bodyEffect']),
  );
  assert.equal(readSaidSignals(days, 'h1', 0, TODAY), null);
});

test('a care habit is ask-only with no effect', () => {
  const days = ['2026-11-10', '2026-11-12', '2026-11-15'].map((day, at) =>
    said(`c${at}`, day, ['tired'], { isCare: true }),
  );
  const [found] = readSaidCandidates({
    observations: days,
    habits: [{ id: 'h1', isCare: true, windowIds: ['w1'] }],
    today: TODAY,
  });
  assert.equal(found.handling, 'askOnly');
  assert.deepEqual(found.effect, { kind: 'none' });
  assert.equal(
    readHandling('saidStruggling', { collection: 'habits' }, false),
    'suggest',
  );
});

test('a smaller step never goes below once a week', () => {
  assert.equal(lowerCadence({ kind: 'timesPerWeek', count: 1 }), null);
  assert.deepEqual(lowerCadence({ kind: 'timesPerWeek', count: 3 }), {
    kind: 'timesPerWeek',
    count: 2,
  });
  assert.equal(lowerCadence({ kind: 'onWeekdays', weekdays: [2] }), null);
  assert.deepEqual(
    lowerCadence({ kind: 'onWeekdays', weekdays: [1, 3, 5] }, [3]),
    {
      kind: 'onWeekdays',
      weekdays: [1, 5],
    },
  );
  assert.deepEqual(lowerCadence({ kind: 'everyDay' }), {
    kind: 'timesPerWeek',
    count: 6,
  });
  assert.equal(raiseCadence({ kind: 'everyDay' }), null);
  assert.deepEqual(raiseCadence({ kind: 'timesPerWeek', count: 6 }), {
    kind: 'everyDay',
  });
});

if (failures > 0) {
  console.error(`check:helm-said: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-said: ok');
