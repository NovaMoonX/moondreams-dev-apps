import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COOK_LOCK_MS,
  COOK_WAKE_IDLE_MS,
  COOK_WAKE_MAX_MS,
  COOK_WAKE_PHRASE,
  COOK_WAKE_SPELLINGS,
  COOK_WAKE_TIMER_GRACE_MS,
} from '../../src/apps/pinch/constants.ts';
import {
  parseCookCommand,
  readCookCommand,
  toPlainText,
  type CookVoiceContext,
} from '../../src/apps/pinch/utils/cookVoice.ts';
import {
  createVoiceState,
  getVoiceEffect,
  getWakeWaitEnd,
  planHeard,
  readWakeWord,
  recordWakeBusy,
  reduceVoice,
  type VoiceEvent,
  type VoicePhase,
  type VoiceState,
  type VoiceStop,
  type WakeBusySpan,
} from '../../src/apps/pinch/utils/cookVoiceMode.ts';

const context: CookVoiceContext = {
  recipes: [{ id: 'adobo', title: 'Adobo chicken' }],
  shownRecipeId: 'adobo',
  lines: [
    { id: 'garlic', names: ['Garlic'], isInStep: true },
    { id: 'salt', names: ['Salt'], isInStep: true },
  ],
  timers: [],
  choice: null,
};

assert.equal(COOK_WAKE_PHRASE, 'Hey Pepper', 'the phrase as it is shown');
COOK_WAKE_SPELLINGS.forEach((spelling) =>
  assert.equal(
    toPlainText(spelling),
    spelling,
    `"${spelling}" is stored as the plain text it is compared as`,
  ),
);
assert.ok(
  COOK_WAKE_SPELLINGS.includes(toPlainText(COOK_WAKE_PHRASE)),
  'the phrase as shown is one of its spellings',
);
assert.ok(
  COOK_WAKE_SPELLINGS.every(
    (spelling) => spelling !== 'pepper' && spelling !== 'hey',
  ),
  'a bare "pepper" or "hey" is never a way to wake it',
);

const rest = (text: string | string[]) => readWakeWord(text)?.rests ?? null;
const restOf = (text: string) => rest(text)?.[0] ?? null;

const wakes: [string, string][] = [
  ['Hey Pepper', ''],
  ['hey pepper', ''],
  ['Hey, Pepper.', ''],
  ['HEY PEPPER!', ''],
  ['  hey   pepper  ', ''],
  ['hay pepper', ''],
  ['Hay, Pepper', ''],
  ['heypepper', ''],
  ['HeyPepper', ''],
  ['Héy Pepper', ''],
  ['hey peper', ''],
  ['hey paper', ''],
  ['Hey, Paper.', ''],
  ['hay paper', ''],
  ['heypaper', ''],
  ['hey papper', ''],
  ['hey peppa', ''],
  ['hey pepa', ''],
  ['hey paper next step', 'next step'],
  ['hey paper how much garlic', 'how much garlic'],
  ['hey pepper next step', 'next step'],
  ['Hey Pepper, next.', 'next'],
  ['Hey Pepper, how much garlic?', 'how much garlic'],
  ['hey pepper stop listening', 'stop listening'],
  ['hey pepper start the ten minute timer', 'start the ten minute timer'],
  ['okay hey pepper next', 'next'],
  ['um hey pepper back', 'back'],
  ['so um hey pepper', ''],
  ['ok, hey pepper, repeat that', 'repeat that'],
  ['hey pepper pepper', 'pepper'],
  ['hey pepper pinch of salt?', 'pinch of salt'],
];
wakes.forEach(([heard, expected]) =>
  assert.equal(
    restOf(heard),
    expected,
    `"${heard}" wakes it, leaving "${expected}"`,
  ),
);

const notWakes = [
  'pepper',
  'the pepper',
  'pepper next',
  'Pepper.',
  'pepper mill',
  'Use a pepper mill to season the onion',
  'peppers',
  'hey peppers',
  'hey peppers mill',
  'okay pepper',
  'ok, pepper, next',
  'yes pepper',
  'hey',
  'hey there',
  'hey chap',
  'hey cheese',
  'hey peppery',
  'hey papers',
  'hey paperwork',
  'paper',
  'a sheet of paper',
  'line it with paper',
  'say hey paper',
  'hey peppered it',
  'hi pepper',
  'they pepper',
  'hay fever',
  'say hey pepper',
  'I said hey pepper next',
  'next hey pepper',
  'the kids said hey pepper',
  'three um hey pepper',
  'um uh well hey pepper',
  'add a pinch of salt',
  'pinch the edges together',
  'next',
  'next step',
  'stop listening',
  '',
  '   ',
  '...',
];
notWakes.forEach((heard) =>
  assert.equal(rest(heard), null, `"${heard}" never wakes it`),
);

const steps = [
  'Season the chicken with a pinch of salt and let it rest for ten minutes.',
  'Add a pinch of nutmeg, then stir.',
  'Pinch the edges of the dumplings together to seal them.',
  'Pinch off a walnut-sized piece of dough and roll it into a ball.',
  'Whisk in the cream. Hey presto, a sauce. Pinch of sugar if it tastes sharp.',
  'Take a pinch of the herbs, rub them between your fingers.',
  'A pinch of chili flakes goes in last.',
  'Okay, pinch the corners and fold.',
  'Finish with a pinch of flaky salt, then serve.',
  'Stir for 2 minutes; pinch of sugar',
  'Heat the oil. Hay is not an ingredient. Add the onion.',
  'Grind fresh pepper over the onion, then stir.',
  'Hey, peppers go in last: stir them in.',
  'Pepper the steak well, then finish with a squeeze of lemon.',
  'Ask for pepper at the counter, then hey presto.',
];
steps.forEach((step) => {
  assert.equal(rest(step), null, `step text never wakes it: "${step}"`);
  step
    .split(/(?<=[.;,])\s+/)
    .forEach((piece) =>
      assert.equal(
        rest(piece),
        null,
        `no sentence of step text wakes it: "${piece}"`,
      ),
    );
});

const seedText = readFileSync(
  new URL('../seeds/pinch.ts', import.meta.url),
  'utf8',
);
const seedStrings = Array.from(
  seedText.matchAll(/'((?:[^'\\\n]|\\.)+)'|"((?:[^"\\\n]|\\.)+)"/g),
  (match) => match[1] ?? match[2],
).filter((text) => text.length > 6);
assert.ok(
  seedStrings.length > 100,
  `the seed's own text is read (${seedStrings.length} strings)`,
);
seedStrings.forEach((text) =>
  text
    .split(/(?<=[.;,!?])\s+/)
    .concat(text)
    .forEach((piece) =>
      assert.equal(
        rest(piece),
        null,
        `the app's own seeded text never wakes it: "${piece}"`,
      ),
    ),
);

assert.deepEqual(
  rest(['hey jeff next', 'hey pepper next', 'a pepper next']),
  [null, 'next', null],
  'a lower guess can wake it and keeps its rank',
);
assert.deepEqual(
  rest(['hey pepper', 'a pepper']),
  ['', null],
  'a wake in the top guess with a plain one below',
);
assert.equal(
  rest(['pepper', 'a pepper', 'hey chap']),
  null,
  'no guess with the phrase wakes nothing',
);
assert.deepEqual(rest('hey pepper next'), ['next'], 'a lone string is one guess');

const afterWake = (heard: string[]) => {
  const woke = readWakeWord(heard);
  return woke === null
    ? null
    : (readCookCommand(
        woke.rests.map((guess) => guess ?? ''),
        context,
      )?.command ?? null);
};
assert.deepEqual(
  afterWake(['hey pepper next step']),
  { kind: 'NEXT' },
  'the command after the wake phrase in the same breath runs',
);
assert.deepEqual(
  afterWake(['Hey Pepper, how much garlic?']),
  { kind: 'AMOUNT', query: 'garlic', lineIds: ['garlic'] },
  'a command with a question in it runs too',
);
assert.deepEqual(
  afterWake(['hey pepper stop listening']),
  { kind: 'STOP_LISTENING' },
  'stop listening after the wake phrase turns voice off',
);
assert.equal(
  afterWake(['hey pepper']),
  null,
  'the phrase alone opens the window and runs nothing',
);
assert.equal(
  afterWake(['hey pepper the weather today']),
  null,
  'words that are not a command run nothing',
);
assert.equal(
  afterWake(['hey jeff back', 'hey pepper back']),
  null,
  'a move said in a lower-ranked guess is never run, though the phrase woke it',
);
assert.deepEqual(
  afterWake(['hey pepper the next batch']),
  null,
  'kitchen talk after the phrase is not a command',
);
assert.deepEqual(
  parseCookCommand('hey pepper next', context),
  { kind: 'NEXT' },
  'in an open window the phrase before a command is tolerated by the grammar',
);
assert.equal(
  parseCookCommand('hey pepper', context),
  null,
  'and the phrase alone is not a command',
);

type PlanCase = [
  phase: VoicePhase,
  heard: string[],
  kind: ReturnType<typeof planHeard>['kind'],
  command: string | null,
];
const planCases: PlanCase[] = [
  ['OFF', ['hey pepper next'], 'IGNORE', null],
  ['OFF', ['next'], 'IGNORE', null],
  ['WAITING', ['next'], 'IGNORE', null],
  ['WAITING', ['stop listening'], 'IGNORE', null],
  ['WAITING', ['add a pinch of salt'], 'IGNORE', null],
  ['WAITING', ['a pinch'], 'IGNORE', null],
  ['WAITING', ['okay pinch the edges'], 'IGNORE', null],
  ['WAITING', ['how much garlic'], 'IGNORE', null],
  ['WAITING', ['hey pepper'], 'WAKE', null],
  ['WAITING', ['Hey, Pepper.'], 'WAKE', null],
  ['WAITING', ['hey pepper next step'], 'WAKE', 'NEXT'],
  ['WAITING', ['hey pepper stop listening'], 'WAKE', 'STOP_LISTENING'],
  ['WAITING', ['hey pepper how much garlic'], 'WAKE', 'AMOUNT'],
  ['WAITING', ['hey pepper the weather today'], 'WAKE', null],
  ['WAITING', ['hey jeff back', 'hey pepper back'], 'WAKE', null],
  ['WINDOW', ['next'], 'COMMAND', 'NEXT'],
  ['WINDOW', ['hey pepper next'], 'COMMAND', 'NEXT'],
  ['WINDOW', ['stop listening'], 'COMMAND', 'STOP_LISTENING'],
  ['WINDOW', ['hey pepper'], 'WAKE', null],
  ['WINDOW', ['can you pass the salt'], 'MISSED', null],
  ['WINDOW', ['a pinch of salt'], 'MISSED', null],
  ['LOCKED', ['next'], 'COMMAND', 'NEXT'],
  ['LOCKED', ['hey pepper next'], 'COMMAND', 'NEXT'],
  ['LOCKED', ['hey pepper'], 'CLEAR', null],
  ['LOCKED', ['the kids are loud'], 'CLEAR', null],
  ['LOCKED', ['a pinch of salt'], 'CLEAR', null],
];
planCases.forEach(([phase, heard, kind, command]) => {
  const plan = planHeard(phase, heard, context);
  const found =
    plan.kind === 'COMMAND' || plan.kind === 'WAKE'
      ? (plan.heard?.command.kind ?? null)
      : null;
  assert.deepEqual(
    [plan.kind, found],
    [kind, command],
    `${phase}: "${heard.join('" / "')}" is ${kind}${command === null ? '' : ` ${command}`}`,
  );
});

const at = 1_000_000;
const stateOf = (
  phase: VoicePhase,
  mode: 'TAP' | 'WAKE',
  epoch = 5,
): VoiceState => ({
  mode,
  phase,
  epoch,
  lockEndsAt: phase === 'LOCKED' ? at : null,
  stopped: phase === 'OFF' ? 'denied' : null,
});

type Row = [
  title: string,
  from: [VoicePhase, 'TAP' | 'WAKE'],
  event: VoiceEvent,
  to: VoicePhase,
  effect: 'START' | 'STOP' | null,
  mode?: 'TAP' | 'WAKE',
];

const table: Row[] = [
  [
    'tap, off, tap mode: one command window',
    ['OFF', 'TAP'],
    { type: 'TAP_MIC' },
    'WINDOW',
    'START',
  ],
  [
    'tap, off, wake mode: a first window, then it waits',
    ['OFF', 'WAKE'],
    { type: 'TAP_MIC' },
    'WINDOW',
    'START',
  ],
  [
    'tap during a tap-mode window ends it',
    ['WINDOW', 'TAP'],
    { type: 'TAP_MIC' },
    'OFF',
    'STOP',
  ],
  [
    'tap during a wake-mode window drops back to waiting',
    ['WINDOW', 'WAKE'],
    { type: 'TAP_MIC' },
    'WAITING',
    null,
  ],
  [
    'tap while waiting turns it off',
    ['WAITING', 'WAKE'],
    { type: 'TAP_MIC' },
    'OFF',
    'STOP',
  ],
  [
    'tap while locked turns it off',
    ['LOCKED', 'TAP'],
    { type: 'TAP_MIC' },
    'OFF',
    'STOP',
  ],
  [
    'tap while locked in wake mode turns it off, not back to waiting',
    ['LOCKED', 'WAKE'],
    { type: 'TAP_MIC' },
    'OFF',
    'STOP',
  ],

  [
    'the phrase while waiting opens a window',
    ['WAITING', 'WAKE'],
    { type: 'WAKE_HEARD' },
    'WINDOW',
    null,
  ],
  [
    'the phrase inside a window restarts it',
    ['WINDOW', 'WAKE'],
    { type: 'WAKE_HEARD' },
    'WINDOW',
    null,
  ],
  [
    'the phrase while off does nothing',
    ['OFF', 'WAKE'],
    { type: 'WAKE_HEARD' },
    'OFF',
    null,
  ],
  [
    'the phrase while locked does nothing',
    ['LOCKED', 'WAKE'],
    { type: 'WAKE_HEARD' },
    'LOCKED',
    null,
  ],

  [
    'a command in a window restarts the window',
    ['WINDOW', 'TAP'],
    { type: 'COMMAND_HEARD' },
    'WINDOW',
    null,
  ],
  [
    'a command while waiting is not heard',
    ['WAITING', 'WAKE'],
    { type: 'COMMAND_HEARD' },
    'WAITING',
    null,
  ],
  [
    'a command while locked changes nothing',
    ['LOCKED', 'TAP'],
    { type: 'COMMAND_HEARD' },
    'LOCKED',
    null,
  ],
  [
    'a command while off does nothing',
    ['OFF', 'TAP'],
    { type: 'COMMAND_HEARD' },
    'OFF',
    null,
  ],

  [
    'a tap-mode window that runs out turns the mic off',
    ['WINDOW', 'TAP'],
    { type: 'WINDOW_ENDED' },
    'OFF',
    'STOP',
  ],
  [
    'a wake-mode window that runs out goes back to waiting',
    ['WINDOW', 'WAKE'],
    { type: 'WINDOW_ENDED' },
    'WAITING',
    null,
  ],
  [
    'a window timer firing late while waiting does nothing',
    ['WAITING', 'WAKE'],
    { type: 'WINDOW_ENDED' },
    'WAITING',
    null,
  ],
  [
    'a window timer firing late while locked does nothing',
    ['LOCKED', 'TAP'],
    { type: 'WINDOW_ENDED' },
    'LOCKED',
    null,
  ],
  [
    'a window timer firing late while off does nothing',
    ['OFF', 'TAP'],
    { type: 'WINDOW_ENDED' },
    'OFF',
    null,
  ],

  [
    'ten quiet minutes while waiting turn it off',
    ['WAITING', 'WAKE'],
    { type: 'WAIT_ENDED' },
    'OFF',
    'STOP',
  ],
  [
    'the wait timer firing late inside a window does nothing',
    ['WINDOW', 'WAKE'],
    { type: 'WAIT_ENDED' },
    'WINDOW',
    null,
  ],
  [
    'the wait timer firing late while locked does nothing',
    ['LOCKED', 'WAKE'],
    { type: 'WAIT_ENDED' },
    'LOCKED',
    null,
  ],

  [
    'the lock running out turns it off',
    ['LOCKED', 'TAP'],
    { type: 'LOCK_ENDED' },
    'OFF',
    'STOP',
  ],
  [
    'the lock timer firing late while waiting does nothing',
    ['WAITING', 'WAKE'],
    { type: 'LOCK_ENDED' },
    'WAITING',
    null,
  ],
  [
    'the lock timer firing late after a tap off does nothing',
    ['OFF', 'TAP'],
    { type: 'LOCK_ENDED' },
    'OFF',
    null,
  ],

  [
    'stop listening from a window turns it off, even in wake mode',
    ['WINDOW', 'WAKE'],
    { type: 'STOP' },
    'OFF',
    'STOP',
  ],
  [
    'stop listening while waiting turns it off',
    ['WAITING', 'WAKE'],
    { type: 'STOP' },
    'OFF',
    'STOP',
  ],
  [
    'stop while locked turns it off',
    ['LOCKED', 'TAP'],
    { type: 'STOP' },
    'OFF',
    'STOP',
  ],
  [
    'stop while off does nothing',
    ['OFF', 'TAP'],
    { type: 'STOP' },
    'OFF',
    null,
  ],

  [
    'a refused microphone while waiting turns it off',
    ['WAITING', 'WAKE'],
    { type: 'ENGINE_STOPPED', reason: 'denied' },
    'OFF',
    'STOP',
  ],
  [
    'a refused microphone in a window turns it off',
    ['WINDOW', 'TAP'],
    { type: 'ENGINE_STOPPED', reason: 'unavailable' },
    'OFF',
    'STOP',
  ],
  [
    'a failing service while locked turns it off',
    ['LOCKED', 'TAP'],
    { type: 'ENGINE_STOPPED', reason: 'service' },
    'OFF',
    'STOP',
  ],
  [
    'an engine stop while off does nothing',
    ['OFF', 'TAP'],
    { type: 'ENGINE_STOPPED', reason: 'denied' },
    'OFF',
    null,
  ],

  [
    'choosing tap to talk while off only remembers it',
    ['OFF', 'WAKE'],
    { type: 'CHOOSE', choice: 'TAP', at },
    'OFF',
    null,
    'TAP',
  ],
  [
    'choosing tap to talk while waiting turns the mic off',
    ['WAITING', 'WAKE'],
    { type: 'CHOOSE', choice: 'TAP', at },
    'OFF',
    'STOP',
    'TAP',
  ],
  [
    'choosing tap to talk in a window lets the window finish',
    ['WINDOW', 'WAKE'],
    { type: 'CHOOSE', choice: 'TAP', at },
    'WINDOW',
    null,
    'TAP',
  ],
  [
    'choosing tap to talk while locked ends the lock',
    ['LOCKED', 'WAKE'],
    { type: 'CHOOSE', choice: 'TAP', at },
    'OFF',
    'STOP',
    'TAP',
  ],
  [
    'choosing the wake phrase while off starts waiting',
    ['OFF', 'TAP'],
    { type: 'CHOOSE', choice: 'WAKE', at },
    'WAITING',
    'START',
    'WAKE',
  ],
  [
    'choosing the wake phrase in a window keeps the window',
    ['WINDOW', 'TAP'],
    { type: 'CHOOSE', choice: 'WAKE', at },
    'WINDOW',
    null,
    'WAKE',
  ],
  [
    'choosing the wake phrase while waiting changes nothing',
    ['WAITING', 'WAKE'],
    { type: 'CHOOSE', choice: 'WAKE', at },
    'WAITING',
    null,
    'WAKE',
  ],
  [
    'choosing the wake phrase while locked ends the lock and waits',
    ['LOCKED', 'TAP'],
    { type: 'CHOOSE', choice: 'WAKE', at },
    'WAITING',
    null,
    'WAKE',
  ],
  [
    'keeping it open while off starts the lock',
    ['OFF', 'TAP'],
    { type: 'CHOOSE', choice: 'LOCK', at },
    'LOCKED',
    'START',
    'TAP',
  ],
  [
    'keeping it open while waiting locks it',
    ['WAITING', 'WAKE'],
    { type: 'CHOOSE', choice: 'LOCK', at },
    'LOCKED',
    null,
    'WAKE',
  ],
  [
    'keeping it open in a window locks it',
    ['WINDOW', 'TAP'],
    { type: 'CHOOSE', choice: 'LOCK', at },
    'LOCKED',
    null,
    'TAP',
  ],
  [
    'keeping it open while already locked keeps the deadline',
    ['LOCKED', 'TAP'],
    { type: 'CHOOSE', choice: 'LOCK', at: at + 60_000 },
    'LOCKED',
    null,
    'TAP',
  ],

  [
    'remembering wake mode while off does not start it',
    ['OFF', 'TAP'],
    { type: 'MODE', mode: 'WAKE' },
    'OFF',
    null,
    'WAKE',
  ],
  [
    'remembering tap mode while off does not start it',
    ['OFF', 'WAKE'],
    { type: 'MODE', mode: 'TAP' },
    'OFF',
    null,
    'TAP',
  ],
];

table.forEach(([title, [phase, mode], event, to, effect, nextMode]) => {
  const from = stateOf(phase, mode);
  const next = reduceVoice(from, event);
  assert.deepEqual(
    [next.phase, getVoiceEffect(from, next), next.mode],
    [to, effect, nextMode ?? mode],
    `${title} (${phase}/${mode} + ${event.type})`,
  );
});

const everyEvent = (): [key: string, event: VoiceEvent][] => [
  ['TAP_MIC', { type: 'TAP_MIC' }],
  ['CHOOSE TAP', { type: 'CHOOSE', choice: 'TAP', at }],
  ['CHOOSE WAKE', { type: 'CHOOSE', choice: 'WAKE', at }],
  ['CHOOSE LOCK', { type: 'CHOOSE', choice: 'LOCK', at }],
  ['MODE TAP', { type: 'MODE', mode: 'TAP' }],
  ['MODE WAKE', { type: 'MODE', mode: 'WAKE' }],
  ['WAKE_HEARD', { type: 'WAKE_HEARD' }],
  ['COMMAND_HEARD', { type: 'COMMAND_HEARD' }],
  ['WINDOW_ENDED', { type: 'WINDOW_ENDED' }],
  ['WAIT_ENDED', { type: 'WAIT_ENDED' }],
  ['LOCK_ENDED', { type: 'LOCK_ENDED' }],
  ['STOP', { type: 'STOP' }],
  ['ENGINE_STOPPED', { type: 'ENGINE_STOPPED', reason: 'denied' }],
];

// The phase each event leads to from every state a person can be in (wake-mode "waiting" is the only waiting there is).
const matrix: Record<string, Record<string, VoicePhase>> = {
  TAP_MIC: {
    'OFF/TAP': 'WINDOW',
    'OFF/WAKE': 'WINDOW',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'OFF',
    'WINDOW/WAKE': 'WAITING',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
  'CHOOSE TAP': {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
  'CHOOSE WAKE': {
    'OFF/TAP': 'WAITING',
    'OFF/WAKE': 'WAITING',
    'WAITING/WAKE': 'WAITING',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'WAITING',
    'LOCKED/WAKE': 'WAITING',
  },
  'CHOOSE LOCK': {
    'OFF/TAP': 'LOCKED',
    'OFF/WAKE': 'LOCKED',
    'WAITING/WAKE': 'LOCKED',
    'WINDOW/TAP': 'LOCKED',
    'WINDOW/WAKE': 'LOCKED',
    'LOCKED/TAP': 'LOCKED',
    'LOCKED/WAKE': 'LOCKED',
  },
  'MODE TAP': {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
  'MODE WAKE': {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'WAITING',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'WAITING',
    'LOCKED/WAKE': 'WAITING',
  },
  WAKE_HEARD: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'WINDOW',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'LOCKED',
    'LOCKED/WAKE': 'LOCKED',
  },
  COMMAND_HEARD: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'WAITING',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'LOCKED',
    'LOCKED/WAKE': 'LOCKED',
  },
  WINDOW_ENDED: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'WAITING',
    'WINDOW/TAP': 'OFF',
    'WINDOW/WAKE': 'WAITING',
    'LOCKED/TAP': 'LOCKED',
    'LOCKED/WAKE': 'LOCKED',
  },
  WAIT_ENDED: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'LOCKED',
    'LOCKED/WAKE': 'LOCKED',
  },
  LOCK_ENDED: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'WAITING',
    'WINDOW/TAP': 'WINDOW',
    'WINDOW/WAKE': 'WINDOW',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
  STOP: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'OFF',
    'WINDOW/WAKE': 'OFF',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
  ENGINE_STOPPED: {
    'OFF/TAP': 'OFF',
    'OFF/WAKE': 'OFF',
    'WAITING/WAKE': 'OFF',
    'WINDOW/TAP': 'OFF',
    'WINDOW/WAKE': 'OFF',
    'LOCKED/TAP': 'OFF',
    'LOCKED/WAKE': 'OFF',
  },
};
assert.deepEqual(
  Object.keys(matrix).sort(),
  everyEvent()
    .map(([key]) => key)
    .sort(),
  'the matrix has a row for every event',
);
everyEvent().forEach(([key, event]) =>
  Object.entries(matrix[key]).forEach(([cell, expected]) => {
    const [phase, mode] = cell.split('/') as [VoicePhase, 'TAP' | 'WAKE'];
    const from = stateOf(phase, mode);
    const next = reduceVoice(from, event);
    assert.equal(
      next.phase,
      expected,
      `${key} from ${cell} leads to ${expected}`,
    );
    const isSame = JSON.stringify(next) === JSON.stringify(from);
    assert.ok(
      !isSame || next === from,
      `${key} from ${cell} that changes nothing returns the same state`,
    );
  }),
);
assert.equal(
  Object.values(matrix).every((row) => Object.keys(row).length === 7),
  true,
  'every event is answered from all seven states a person can be in',
);

assert.equal(
  reduceVoice(stateOf('WINDOW', 'TAP', 7), { type: 'COMMAND_HEARD' }).epoch,
  8,
  'a command restarts the window with a new epoch',
);
assert.equal(
  reduceVoice(stateOf('WAITING', 'WAKE', 7), { type: 'WAKE_HEARD' }).epoch,
  8,
  'the phrase opens the window with a new epoch',
);
assert.equal(
  reduceVoice(stateOf('WINDOW', 'WAKE', 7), { type: 'WINDOW_ENDED' }).epoch,
  7,
  'a window ending does not count as a new one',
);
assert.equal(
  reduceVoice(stateOf('OFF', 'TAP', 7), { type: 'TAP_MIC' }).stopped,
  null,
  'turning the mic on again forgets why it last stopped',
);
assert.equal(
  reduceVoice(stateOf('LOCKED', 'TAP'), { type: 'LOCK_ENDED' }).stopped,
  'lock-ended',
  'the lock running out says so',
);
assert.equal(
  reduceVoice(stateOf('WAITING', 'WAKE'), { type: 'WAIT_ENDED' }).stopped,
  'wake-idle',
  'ten quiet minutes say so',
);
assert.equal(
  reduceVoice(stateOf('WAITING', 'WAKE'), { type: 'TAP_MIC' }).stopped,
  null,
  'a tap that turns it off is not a reason to explain',
);
assert.equal(
  reduceVoice(stateOf('WAITING', 'WAKE'), {
    type: 'ENGINE_STOPPED',
    reason: 'denied',
  }).stopped,
  'denied',
  'a refused microphone is the reason',
);
assert.equal(
  reduceVoice(stateOf('OFF', 'TAP'), { type: 'CHOOSE', choice: 'LOCK', at })
    .lockEndsAt,
  at + COOK_LOCK_MS,
  'the lock ends fifteen minutes after the tap',
);
assert.equal(COOK_LOCK_MS, 900_000, 'the lock is fifteen minutes');

{
  const seeds = Array.from({ length: 200 }, (_, index) => index + 1);
  const next = (seed: number) =>
    (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  const walk = (seed: number) => {
    const first = createVoiceState(seed % 2 === 0 ? 'TAP' : 'WAKE');
    const result = Array.from({ length: 60 }).reduce<{
      state: VoiceState;
      rng: number;
      starts: number;
      stops: number;
    }>(
      (acc) => {
        const rng = next(acc.rng);
        const events = everyEvent();
        const [, event] = events[rng % events.length];
        const reduced = reduceVoice(acc.state, event);
        const effect = getVoiceEffect(acc.state, reduced);
        assert.ok(
          reduced.phase !== 'WAITING' || reduced.mode === 'WAKE',
          'waiting only ever happens in wake mode',
        );
        assert.equal(
          reduced.lockEndsAt !== null,
          reduced.phase === 'LOCKED',
          'a lock deadline exists exactly while it is locked',
        );
        assert.ok(
          reduced.stopped === null || reduced.phase === 'OFF',
          'a stop reason only shows while the mic is off',
        );
        assert.ok(
          reduced === acc.state ||
            JSON.stringify(reduced) !== JSON.stringify(acc.state),
          'a step that changes nothing returns the same state',
        );
        assert.equal(
          effect === 'START',
          acc.state.phase === 'OFF' && reduced.phase !== 'OFF',
          'the recognizer is started exactly when the mic opens',
        );
        assert.equal(
          effect === 'STOP',
          acc.state.phase !== 'OFF' && reduced.phase === 'OFF',
          'and stopped exactly when it closes',
        );
        return {
          state: reduced,
          rng,
          starts: acc.starts + (effect === 'START' ? 1 : 0),
          stops: acc.stops + (effect === 'STOP' ? 1 : 0),
        };
      },
      { state: first, rng: seed, starts: 0, stops: 0 },
    );
    assert.ok(
      result.starts - result.stops === (result.state.phase === 'OFF' ? 0 : 1),
      'starts and stops pair up',
    );
  };
  seeds.forEach(walk);
}

const stops: VoiceStop[] = [
  'denied',
  'service',
  'no-microphone',
  'unavailable',
  'language',
  'wake-idle',
  'lock-ended',
];
assert.equal(new Set(stops).size, stops.length, 'each stop reason is its own');

// How long a wait for the phrase lasts when timers run
const WAIT_MIN = 60_000;
const WAIT_T0 = Date.UTC(2026, 9, 16, 19, 0);
assert.equal(COOK_WAKE_IDLE_MS, 10 * WAIT_MIN, 'ten quiet minutes');
assert.equal(
  COOK_WAKE_TIMER_GRACE_MS,
  2 * WAIT_MIN,
  'two minutes after a ring',
);
assert.equal(COOK_WAKE_MAX_MS, 60 * WAIT_MIN, 'an hour at most');

const waitCases: [string, WakeBusySpan[], number][] = [
  ['no timer: ten minutes after it began', [], 10],
  [
    'a timer running from the start: the clock stands still to the cap',
    [{ from: 0, to: null }],
    60,
  ],
  [
    'a timer started after the ten minutes had passed: the wait was over before it',
    [{ from: 15 * WAIT_MIN, to: null }],
    10,
  ],
  [
    'a timer that ran from minute 1 to 26 and was stopped: one minute used, nine left after it',
    [{ from: 1 * WAIT_MIN, to: 26 * WAIT_MIN }],
    35,
  ],
  [
    'the same timer ringing: nine more quiet minutes after its two minutes of grace',
    [
      { from: 1 * WAIT_MIN, to: 26 * WAIT_MIN },
      { from: 26 * WAIT_MIN, to: 28 * WAIT_MIN },
    ],
    37,
  ],
  [
    'a timer longer than the cap: the cap',
    [{ from: 1 * WAIT_MIN, to: 80 * WAIT_MIN }],
    60,
  ],
  [
    'two overlapping timers count once',
    [
      { from: 1 * WAIT_MIN, to: 20 * WAIT_MIN },
      { from: 10 * WAIT_MIN, to: 30 * WAIT_MIN },
    ],
    39,
  ],
  [
    'two timers with quiet between them: each stretch of quiet counts',
    [
      { from: 3 * WAIT_MIN, to: 10 * WAIT_MIN },
      { from: 15 * WAIT_MIN, to: 30 * WAIT_MIN },
    ],
    32,
  ],
  [
    'stretches given out of order give the same end',
    [
      { from: 15 * WAIT_MIN, to: 30 * WAIT_MIN },
      { from: 3 * WAIT_MIN, to: 10 * WAIT_MIN },
    ],
    32,
  ],
  [
    'a stretch that began before the wait counts from the wait',
    [{ from: -5 * WAIT_MIN, to: 4 * WAIT_MIN }],
    14,
  ],
];
waitCases.forEach(([name, spans, minutes]) =>
  assert.equal(
    getWakeWaitEnd(
      WAIT_T0,
      spans.map((span) => ({
        from: WAIT_T0 + span.from,
        to: span.to === null ? null : WAIT_T0 + span.to,
      })),
    ),
    WAIT_T0 + minutes * WAIT_MIN,
    name,
  ),
);

const look = (
  spans: WakeBusySpan[],
  at: number,
  runningTimers: number,
  lastRingAt: number | null,
) =>
  recordWakeBusy(spans, {
    enteredAt: WAIT_T0,
    now: WAIT_T0 + at * WAIT_MIN,
    runningTimers,
    lastRingAt: lastRingAt === null ? null : WAIT_T0 + lastRingAt * WAIT_MIN,
  });
const waitAt = (minutes: number) => WAIT_T0 + minutes * WAIT_MIN;

assert.deepEqual(look([], 0, 0, null), [], 'nothing runs: nothing is recorded');
const started = look([], 2, 1, null);
assert.deepEqual(
  started,
  [{ from: waitAt(2), to: null }],
  'the first timer opens a stretch',
);
assert.deepEqual(
  look(started, 3, 2, null),
  started,
  'a second timer joins the open stretch',
);
const stopped = look(started, 9, 0, null);
assert.deepEqual(
  stopped,
  [{ from: waitAt(2), to: waitAt(9) }],
  'none running closes it where it was seen',
);
const rang = look(started, 27, 0, 27);
assert.deepEqual(
  rang,
  [
    { from: waitAt(2), to: waitAt(27) },
    { from: waitAt(27), to: waitAt(29) },
  ],
  'a ring closes the stretch and adds two minutes of grace',
);
assert.deepEqual(
  look(rang, 28, 0, 27),
  rang,
  'the same ring is not added twice',
);
assert.deepEqual(
  look([], 5, 0, -3),
  [],
  'a ring from before the wait began is not counted',
);
assert.equal(
  getWakeWaitEnd(WAIT_T0, rang),
  waitAt(29 + 8),
  'timer from minute 2 to the ring at 27, then grace to 29: two quiet minutes used, eight left after the grace',
);

console.log('pinchWake: timer-aware wait checks passed');

console.log('pinchWake: all checks passed');
