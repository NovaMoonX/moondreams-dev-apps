// What a turn does when the person only says how things go: a question stays answered, a plain request acts, a remark acts only on something within two days and otherwise keeps what was said; the tags, quote and alias an observation needs; no promise to watch when learning is off.
import assert from 'node:assert/strict';

import { WATCHING_PHRASES as CLIENT_WATCHING_PHRASES } from '../../src/apps/helm/constants.ts';
import {
  isWithin48h,
  readActNow,
  readObservations,
  readTurnIntent,
  toDisposition,
  WATCHING_PHRASES,
  withoutWatchingPhrases,
} from '../../functions/src/apps/helm/nomos/actNow.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  buildFileResultsTool,
  type CaptureReading,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  nextReflectionAt,
  readTurnSubjects,
} from '../../functions/src/apps/helm/nomos/planObservations.ts';
import { maskOthersHealth } from '../../functions/src/apps/helm/nomos/said.ts';

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

const NOW = Date.parse('2026-11-16T10:00:00Z');
const HOUR = 3_600_000;
const TURN = 'Skipped guitar, too tired after work. Dana has panic attacks.';
const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};
const habits = createAliasBook('h');
habits.add('habit-guitar');

const normalize = (raw: Record<string, unknown>, isLearningOn: boolean) =>
  normalizeNomosReply(
    { commands: [], ...raw },
    {
      reading: READING,
      aliases: createAliasBook('t'),
      habits,
      captureText: TURN,
      isLearningOn,
    },
  );
const observation = (extra: Record<string, unknown> = {}) => ({
  aboutAlias: 'h1',
  kind: 'feeling',
  tags: ['tired'],
  quote: 'too tired after work',
  ...extra,
});

test('a plain request acts', () => {
  assert.equal(
    readActNow({
      intent: 'request',
      commands: [{ kind: 'createTask' }],
      subjects: [{ isWithin48h: false, isCare: false }],
    }),
    'act',
  );
});

test('a remark touching something within 48 hours acts', () => {
  assert.equal(
    readActNow({
      intent: 'remark',
      commands: [{ kind: 'checkIn' }],
      subjects: [{ isWithin48h: true, isCare: false }],
    }),
    'act',
  );
  assert.equal(isWithin48h(NOW + 47 * HOUR, NOW), true);
  assert.equal(isWithin48h(NOW + 49 * HOUR, NOW), false);
  assert.equal(isWithin48h(null, NOW), false);
});

test('a remark touching a care item beyond 48 hours is only noted', () => {
  assert.equal(
    readActNow({
      intent: 'remark',
      commands: [{ kind: 'checkIn' }, { kind: 'createHabit' }],
      subjects: [
        { isWithin48h: true, isCare: false },
        { isWithin48h: false, isCare: true },
      ],
    }),
    'note',
  );
});

test('a remark that creates something acts, whenever it is due', () => {
  ['createTask', 'createNote', 'createProject', 'setKeyDate', 'create'].forEach(
    (kind) =>
      assert.equal(
        readActNow({
          intent: 'remark',
          commands: [{ kind: 'remember' }, { kind }],
          subjects: [{ isWithin48h: false, isCare: false }],
        }),
        'act',
      ),
  );
});

test('a question that was answered stays answered', () => {
  assert.equal(
    readActNow({ intent: 'question', commands: [], subjects: [] }),
    'answered',
  );
  assert.equal(
    readActNow({
      intent: 'remark',
      commands: [{ kind: 'answer' }],
      subjects: [],
    }),
    'answered',
  );
});

test('a remark about how things go is noted, keeping remember', () => {
  assert.equal(
    readActNow({
      intent: 'remark',
      commands: [{ kind: 'remember' }],
      subjects: [],
    }),
    'note',
  );
  assert.equal(
    readActNow({
      intent: 'remark',
      commands: [{ kind: 'updateHabit' }],
      subjects: [{ isWithin48h: false, isCare: false }],
    }),
    'note',
  );
  assert.equal(toDisposition('note'), 'noted');
  assert.equal(toDisposition('act'), 'acted');
  assert.equal(toDisposition('answered'), 'answered');
});

test('what a turn touches is read from its commands', () => {
  const subjects = readTurnSubjects(
    {
      commands: [
        {
          kind: 'createTask',
          questions: [],
          meeting: null,
          ref: '$1',
          title: 'Call',
          due: { kind: 'day', date: NOW + 10 * 86_400_000 },
          isUrgent: false,
          whoRefs: [],
          placeRefs: [],
          projectRef: null,
        },
      ],
      habitCommands: [],
      hasPlanDay: false,
      hasHome: false,
      extras: 0,
    },
    NOW,
  );
  assert.deepEqual(subjects, [{ isWithin48h: false, isCare: false }]);
});

test('an unknown intent reads as a request, or a question beside an answer', () => {
  assert.equal(readTurnIntent('bogus', false), 'request');
  assert.equal(readTurnIntent(undefined, true), 'question');
  assert.equal(readTurnIntent('remark', true), 'remark');
});

test('learning off drops a sentence that promises to watch, and on keeps it', () => {
  const raw = { replyLine: 'Skipped it. Will keep an eye on it.' };
  assert.equal(normalize(raw, false).replyLine, 'Skipped it.');
  assert.equal(
    normalize(raw, true).replyLine,
    'Skipped it. Will keep an eye on it.',
  );
  assert.equal(withoutWatchingPhrases('Noted.'), null);
  assert.equal(withoutWatchingPhrases('Denoted fine.'), 'Denoted fine.');
  assert.equal(withoutWatchingPhrases(null), null);
});

test('the watching phrases match the device list', () => {
  assert.deepEqual([...WATCHING_PHRASES], [...CLIENT_WATCHING_PHRASES]);
});

test('an observation is kept with its habit, closed tags and quote', () => {
  const kept = normalize({ observations: [observation()] }, true).observations;
  assert.deepEqual(kept, [
    {
      subject: { collection: 'habits', id: 'habit-guitar' },
      kind: 'feeling',
      tags: ['tired'],
      quote: 'too tired after work',
    },
  ]);
});

test('an observation whose quote is not in the turn is dropped', () => {
  assert.deepEqual(
    normalize(
      { observations: [observation({ quote: 'felt completely drained' })] },
      true,
    ).observations,
    [],
  );
});

test('an unknown tag is dropped, and none left drops the observation', () => {
  assert.deepEqual(
    normalize({ observations: [observation({ tags: ['grumpy'] })] }, true)
      .observations,
    [],
  );
  assert.deepEqual(
    normalize(
      { observations: [observation({ tags: ['grumpy', 'tired'] })] },
      true,
    ).observations[0].tags,
    ['tired'],
  );
});

test('an alias that names nothing is about the day', () => {
  assert.deepEqual(
    normalize({ observations: [observation({ aboutAlias: 'h9' })] }, true)
      .observations[0].subject,
    { collection: 'day', id: null },
  );
  assert.deepEqual(
    normalize({ observations: [observation({ aboutAlias: null })] }, true)
      .observations[0].subject,
    { collection: 'day', id: null },
  );
});

test('learning off keeps no observation, and at most three are kept', () => {
  assert.deepEqual(
    normalize({ observations: [observation()] }, false).observations,
    [],
  );
  assert.equal(
    readObservations(
      Array.from({ length: 5 }, () => observation()),
      {
        isLearningOn: true,
        turnText: TURN,
        resolve: () => null,
      },
    ).length,
    3,
  );
});

test("another person's health is masked from a quote", () => {
  assert.equal(maskOthersHealth('Dana has panic attacks', ['Dana']), null);
  assert.equal(
    maskOthersHealth('too tired after work', ['Dana']),
    'too tired after work',
  );
});

test('the tool asks for an intent always, and observations only when on', () => {
  const on = buildFileResultsTool({ isLearningOn: true }).inputSchema as {
    required: string[];
    properties: Record<string, unknown>;
  };
  const off = buildFileResultsTool({ isLearningOn: false }).inputSchema as {
    required: string[];
    properties: Record<string, unknown>;
  };
  assert.ok(on.required.includes('intent') && off.required.includes('intent'));
  assert.ok('observations' in on.properties);
  assert.ok(!('observations' in off.properties));
});

test("the reflection is first due at the next 03:00 in the person's zone", () => {
  assert.equal(
    nextReflectionAt(Date.parse('2026-11-16T10:00:00Z'), 'UTC'),
    Date.parse('2026-11-17T03:00:00Z'),
  );
  assert.equal(
    nextReflectionAt(Date.parse('2026-11-16T01:00:00Z'), 'UTC'),
    Date.parse('2026-11-16T03:00:00Z'),
  );
  assert.equal(
    nextReflectionAt(Date.parse('2026-11-16T10:00:00Z'), 'America/Los_Angeles'),
    Date.parse('2026-11-16T11:00:00Z'),
  );
});

if (failures > 0) {
  console.error(`check:helm-act-now: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-act-now: ok');
