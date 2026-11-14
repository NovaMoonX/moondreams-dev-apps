import assert from 'node:assert/strict';

import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import type { NomosCommand } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planWrites,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import {
  buildSpokenAck,
  SPOKEN_MAX_CHARS,
  type SpokenAckInput,
} from '../../functions/src/apps/helm/nomos/spoken.ts';
import { UNDO_PHRASES } from '../../src/apps/helm/constants.ts';
import {
  isUndoPhrase,
  normalizeSaid,
  toWakeSpellings,
} from '../../src/apps/helm/utils/voicePhrases.ts';
import {
  HELM_DEFAULT_VOICE as SERVER_DEFAULT_VOICE,
  HELM_SPEED_RANGE,
  HELM_VOICE_NAMES,
} from '../../functions/src/apps/helm/voiceIdentity.ts';
import type { HelmQuestion } from '../../src/apps/helm/types.ts';
import { matchSpokenAnswer } from '../../src/apps/helm/utils/questionAnswers.ts';
import {
  HELM_DEFAULT_VOICE,
  HELM_VOICES,
  HELM_VOICE_SPEEDS,
  toHelmVoiceSpeed,
} from '../../src/apps/helm/voices.ts';
import { readWakePhrase } from '../../src/lib/speech/speechText.ts';

const NOW = Date.UTC(2026, 10, 9, 20, 0);
const ZONE = 'America/Los_Angeles';

const ack = (overrides: Partial<SpokenAckInput>) =>
  buildSpokenAck({
    inputMode: 'voice',
    counts: { made: 1, updated: 0, completed: 0 },
    messageCount: 1,
    created: [{ title: 'Call Grandpa', due: null }],
    timeZone: ZONE,
    now: NOW,
    ...overrides,
  });

const cases: [string, string | null, string | null][] = [
  ['one task with no day', ack({}), 'Got it. Call Grandpa.'],
  [
    'one task with a day this week',
    ack({
      created: [
        {
          title: 'Call the florist',
          due: { kind: 'day', date: Date.UTC(2026, 10, 13) },
        },
      ],
    }),
    'Got it. Call the florist on Friday.',
  ],
  [
    'one task due tomorrow',
    ack({
      created: [
        {
          title: 'Buy the rings',
          due: { kind: 'day', date: Date.UTC(2026, 10, 10) },
        },
      ],
    }),
    'Got it. Buy the rings tomorrow.',
  ],
  [
    'one task at a moment, read in the person zone',
    ack({
      created: [
        {
          title: 'Call Dana',
          due: { kind: 'moment', at: Date.UTC(2026, 10, 10, 17, 30) },
        },
      ],
    }),
    'Got it. Call Dana tomorrow at 9:30 AM.',
  ],
  [
    'one task at a moment later this week',
    ack({
      created: [
        {
          title: 'Call Dana',
          due: { kind: 'moment', at: Date.UTC(2026, 10, 13, 17, 0) },
        },
      ],
    }),
    'Got it. Call Dana on Friday at 9 AM.',
  ],
  [
    'one task a week or more away',
    ack({
      created: [
        {
          title: 'Send the invitations',
          due: { kind: 'day', date: Date.UTC(2026, 10, 20) },
        },
      ],
    }),
    'Got it. Send the invitations on November 20.',
  ],
  [
    'a title that ends in a full stop',
    ack({ created: [{ title: 'Call Grandpa.', due: null }] }),
    'Got it. Call Grandpa.',
  ],
  [
    'several tasks fall back to the summary sentence',
    ack({
      counts: { made: 3, updated: 0, completed: 0 },
      created: ['a', 'b', 'c'].map((title) => ({ title, due: null })),
    }),
    'Got it. Made 3 tasks.',
  ],
  [
    'a change to a task is the summary sentence',
    ack({ counts: { made: 0, updated: 1, completed: 0 }, created: [] }),
    'Got it. Updated a task.',
  ],
  [
    'a joined turn keeps its own opener',
    ack({
      counts: { made: 3, updated: 0, completed: 0 },
      messageCount: 3,
      created: ['a', 'b', 'c'].map((title) => ({ title, due: null })),
    }),
    'Got all three: made 3 tasks.',
  ],
  ['a typed turn says nothing', ack({ inputMode: 'typed' }), null],
  ['a turn with no mode says nothing', ack({ inputMode: undefined }), null],
  [
    'nothing changed says nothing',
    ack({ counts: { made: 0, updated: 0, completed: 0 }, created: [] }),
    null,
  ],
];
cases.forEach(([title, built, expected]) =>
  assert.equal(built, expected, title),
);

const long = ack({
  created: [{ title: `Call ${'the florist and '.repeat(40)}`, due: null }],
});
assert.ok(
  long !== null && long.length <= SPOKEN_MAX_CHARS,
  `a long title is cut to ${SPOKEN_MAX_CHARS} characters`,
);
assert.ok(
  long?.startsWith('Got it. Call the florist'),
  'the cut line keeps its start',
);

const commands: NomosCommand[] = [
  {
    kind: 'createTask',
    ref: '$new1',
    title: 'Call the florist',
    due: { kind: 'day', date: Date.UTC(2026, 10, 13) },
    isUrgent: false,
    whoRefs: [],
    placeRefs: [],
    projectRef: null,
  },
];
const sealedFor = (inputMode: string) => {
  const plan = planWrites({
    commands,
    existing: new Map(),
    captureId: 'c1',
    executionId: 'e1',
    now: NOW,
    seal: (fields) => fields as unknown as SealedPayload,
    newId: () => 't1',
  });
  return buildExecution(plan, {
    commands,
    captureId: 'c1',
    now: NOW,
    seal: (fields) => fields as unknown as SealedPayload,
    inputMode,
    timeZone: ZONE,
  }).sealed as unknown as { summary: string; spoken: string | null };
};
assert.equal(
  sealedFor('voice').spoken,
  'Got it. Call the florist on Friday.',
  'a spoken turn seals its line with the execution',
);
assert.equal(sealedFor('typed').spoken, null, 'a typed turn seals no line');

(
  [
    ['undo that', true],
    ['Undo that.', true],
    ['  UNDO  ', true],
    ['Take that back!', true],
    ['take that back', true],
    ['Undo, that', false],
    ['undo the dentist', false],
    ['undo that and call Sam', false],
    ['please undo that', false],
    ['', false],
  ] as const
).forEach(([said, expected]) =>
  assert.equal(
    isUndoPhrase(said),
    expected,
    `"${said}" ${expected ? 'is' : 'is not'} an undo phrase`,
  ),
);
assert.equal(
  normalizeSaid('Don’t Do That… '),
  "don't do that",
  'apostrophes and end punctuation are settled',
);
assert.deepEqual(
  UNDO_PHRASES,
  ['undo that', 'undo', 'take that back'],
  'the undo phrases',
);

const wake = (heard: string, name = 'Nomos') =>
  readWakePhrase(heard, toWakeSpellings(name))?.rests[0] ?? undefined;
assert.equal(wake('Hey Nomos'), '', 'the phrase alone wakes it');
assert.equal(wake('hey, Nomos.'), '', 'punctuation is ignored');
assert.equal(
  wake('Okay hey Nomos call Sam at five'),
  'call sam at five',
  'what follows the phrase is the turn',
);
assert.equal(
  wake('Nomos call Sam'),
  undefined,
  'the name alone does not wake it',
);
assert.equal(
  wake('tell Sam hey Nomos'),
  undefined,
  'the phrase is only matched at the start',
);
assert.equal(
  wake('Hey Pepper', 'Pepper'),
  '',
  'renaming the assistant renames the phrase',
);
assert.equal(
  wake('Hey Nomos', 'Pepper'),
  undefined,
  'the old name no longer wakes it',
);

const dayQuestion: HelmQuestion = {
  kind: 'asked',
  builtBy: 'model',
  shape: 'dateTime',
  prompt: 'When is it due?',
  options: [],
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: 'date',
  number: null,
  aboutRef: null,
  answer: null,
};
const readDay = (text: string) =>
  matchSpokenAnswer(text, dayQuestion, { now: NOW, timeZone: ZONE });
assert.equal(readDay('Friday')?.kind, 'answer', 'a day on its own is placed');
assert.equal(
  readDay('on Friday please')?.kind,
  'answer',
  'a day with filler words is placed',
);
assert.equal(
  readDay('remind me Friday to call Dana'),
  null,
  'a day inside another request is not an answer',
);

// The server's list of allowed voices and the picker's list are the same 30 names.
const pickerNames = HELM_VOICES.map((voice) => voice.name);
assert.equal(pickerNames.length, 30, 'the picker offers 30 voices');
assert.equal(new Set(pickerNames).size, 30, 'no voice is listed twice');
assert.ok(
  pickerNames.includes(HELM_DEFAULT_VOICE),
  'the default voice is one the picker offers',
);
assert.deepEqual(
  [...pickerNames].sort(),
  [...HELM_VOICE_NAMES].sort(),
  "the picker's voices are the server's voices",
);
assert.equal(
  HELM_DEFAULT_VOICE,
  SERVER_DEFAULT_VOICE,
  'the picker and the server default to the same voice',
);
assert.deepEqual(
  [HELM_VOICE_SPEEDS[0], HELM_VOICE_SPEEDS.at(-1)],
  [HELM_SPEED_RANGE.min, HELM_SPEED_RANGE.max],
  "the speed notches span the server's range",
);
(['female', 'male'] as const).forEach((gender) =>
  (['calm', 'clear', 'lively'] as const).forEach((group) =>
    assert.ok(
      HELM_VOICES.some(
        (voice) => voice.gender === gender && voice.group === group,
      ),
      `${gender} ${group} has voices`,
    ),
  ),
);
assert.deepEqual(
  [toHelmVoiceSpeed(null), toHelmVoiceSpeed(1.04), toHelmVoiceSpeed(0.85)],
  [1, 1, 0.8],
  'a stored speed reads as its nearest notch, normal when null',
);
assert.ok(HELM_VOICE_SPEEDS.includes(1), 'normal pace is a notch');

console.log(
  'check:helm-voice: spoken lines, undo phrases and the wake phrase passed.',
);
