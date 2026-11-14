import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type {
  CaptureReading,
  HabitCommand,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planHabitAnswer,
  planHabitCommands,
  planResolveHabit,
  type HabitPlanInput,
} from '../../functions/src/apps/helm/nomos/planHabitCommands.ts';
import { isHabitTurn } from '../../functions/src/apps/helm/nomos/route.ts';
import { decideHabit } from '../../functions/src/apps/helm/nomos/policy.ts';
import { maskContextRecords } from '../../functions/src/apps/helm/nomos/unattended.ts';
import {
  EMPTY_HABIT_DAY,
  isPrivateHabit,
  toContextHabit,
  writeHabitDayIn,
  type LiveHabit,
  type LiveHabitDay,
} from '../../functions/src/apps/helm/habitStore.ts';

const NOW = 1_700_000_000_000;
const DAY_KEY = '2023-11-14';
const seal = (fields: Record<string, unknown>) => fields as never;
let counter = 0;
const newId = () => `id-${(counter += 1)}`;

const reading: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const habit = (over: Partial<LiveHabit> & { id: string; name: string }) =>
  ({
    emoji: null,
    notes: null,
    medicine: null,
    windows: {},
    importance: null,
    privateMark: null,
    isPrivacyCleared: false,
    status: 'active',
    storedStatus: over.status ?? 'active',
    lastEditedAt: null,
    cadence: { kind: 'everyDay' },
    windowState: {},
    timesPerDay: null,
    forWhoId: null,
    isCare: false,
    startsOn: Date.parse('2023-11-01T00:00:00Z'),
    endsOn: null,
    pausedUntil: null,
    careAskedAt: null,
    stage: null,
    reminder: null,
    history: [],
    privacy: 'ordinary',
    ...over,
  }) as LiveHabit;

const evening = habit({
  id: 'pills-pm',
  name: 'Evening pills',
  windows: { w1: { label: 'Evening' } },
  windowState: {
    w1: {
      start: '21:00',
      end: '23:00',
      part: 'bedtime',
      order: 0,
      editedAt: null,
    },
  },
});
const morning = habit({
  id: 'pills-am',
  name: 'Morning pills',
  windows: { w2: { label: 'Evening' } },
  windowState: {
    w2: {
      start: '21:00',
      end: '23:00',
      part: 'bedtime',
      order: 0,
      editedAt: null,
    },
  },
});
const water = habit({ id: 'water', name: 'Water', timesPerDay: 8 });

const base: Omit<HabitPlanInput, 'commands'> = {
  habits: [evening, morning, water],
  days: new Map<string, LiveHabitDay>(),
  selfWhoId: null,
  knownWhoIds: new Set(['mom']),
  timeZone: 'UTC',
  profile: { dayStartTime: '08:00', dayEndTime: '22:00' },
  isLearningOn: true,
  at: NOW,
  now: NOW,
  captureId: 'cap-1',
  executionId: 'exec-1',
  isUnattended: false,
  newId,
  seal,
  room: 40,
};

const plan = (commands: HabitCommand[], over: Partial<HabitPlanInput> = {}) =>
  planHabitCommands({ ...base, commands, ...over });

const checkIn = (over: Partial<Extract<HabitCommand, { kind: 'checkIn' }>>) =>
  ({
    kind: 'checkIn',
    habitIds: ['pills-pm'],
    windowKey: null,
    day: 'today',
    status: 'done',
    note: null,
    ...over,
  }) as HabitCommand;

const ticked = plan([checkIn({})]);
assert.equal(ticked.effects.length, 1);
assert.deepEqual(ticked.effectRefs[0], {
  op: 'create',
  collection: 'habitDays',
  docId: DAY_KEY,
});
assert.equal(ticked.dayWrites[0].checks[0].windowId, 'w1');
assert.equal(ticked.dayWrites[0].checks[0].check.by, 'nomos');
assert.ok(!ticked.lines[0].endsWith('.'));
assert.equal(ticked.followUp?.habitId, 'pills-pm');

const twice = plan([checkIn({}), checkIn({})]);
assert.equal(twice.effects.length, 1);
assert.equal(twice.notKept.length, 1);
assert.match(twice.notKept[0], /already ticked/);

const ambiguous = plan([checkIn({ habitIds: ['pills-pm', 'pills-am'] })]);
assert.equal(ambiguous.effects.length, 0);
assert.equal(ambiguous.questions.length, 1);
assert.equal(ambiguous.questions[0].state.kind, 'whichHabit');
assert.deepEqual(
  (ambiguous.questions[0].sealed.options as { id: string }[]).map((o) => o.id),
  ['pills-pm', 'pills-am', 'both'],
);

const answered = planHabitAnswer({
  held: (
    ambiguous.questions[0].sealed.heldCommands as Record<string, unknown>[]
  )[0],
  optionId: 'both',
  habits: base.habits,
  days: base.days,
  timeZone: 'UTC',
  profile: base.profile,
  at: NOW,
  now: NOW,
  captureId: 'cap-1',
  executionId: 'exec-2',
  newId,
  seal,
});
assert.equal(answered?.effects.length, 2);

const note = plan([checkIn({ note: 'felt dizzy' })]);
assert.deepEqual(note.dayWrites[0].noteKeys, [
  { habitId: 'pills-pm', key: 'pills-pm/w1' },
]);
assert.deepEqual(
  (
    note.dayWrites[0].sealed as unknown as {
      notes: Record<string, { text: string }>;
    }
  ).notes['pills-pm/w1'].text,
  'felt dizzy',
);
assert.ok(
  note.effects.every(
    (effect) => !JSON.stringify(effect).includes('felt dizzy'),
  ),
);
assert.equal(note.effects[0].written.noteKey, 'pills-pm/w1');

const tally = plan([
  checkIn({ habitIds: ['water'] }),
  checkIn({ habitIds: ['water'] }),
]);
assert.equal(tally.dayWrites[0].tallies.length, 2);
assert.equal(tally.effects[1].written['entries.water.count'], 2);

const skipped = plan([checkIn({ status: 'skipped' })]);
assert.equal(skipped.dayWrites[0].checks[0].check.status, 'skipped');
assert.equal(skipped.followUp, null);

const careHabit = habit({
  ...evening,
  id: 'meds',
  name: 'Metoprolol',
  isCare: true,
  privacy: 'private',
  privateMark: 'health',
});
assert.equal(
  plan([checkIn({ habitIds: ['meds'] })], { habits: [careHabit] }).followUp,
  null,
);
assert.notEqual(
  plan([checkIn({ habitIds: ['meds'], note: 'felt dizzy' })], {
    habits: [careHabit],
  }).followUp,
  null,
);
assert.equal(plan([checkIn({})], { isLearningOn: false }).followUp, null);
assert.equal(plan([checkIn({})], { isUnattended: true }).followUp, null);

(['paused', 'ended', 'retired'] as const).forEach((status) => {
  const gone = plan([checkIn({})], {
    habits: [habit({ ...evening, status })],
  });
  assert.equal(gone.effects.length, 0);
  assert.equal(gone.dayWrites.length, 0);
  assert.match(
    gone.notKept[0],
    new RegExp(status === 'ended' ? 'ended' : status),
  );
});

const privateName = plan([checkIn({ habitIds: ['meds'] })], {
  habits: [careHabit],
  isUnattended: true,
});
assert.ok(privateName.lines.every((line) => !/metoprolol/i.test(line)));

const created = plan([
  {
    kind: 'createHabit',
    name: 'Pills',
    emoji: null,
    cadence: { kind: 'everyDay' },
    windows: [
      { part: 'morning', start: null, end: null, label: null },
      { part: 'bedtime', start: null, end: null, label: null },
    ],
    timesPerDay: null,
    forWhoId: null,
    isCare: false,
    isPrivate: false,
    words: 'start a habit of pills in the morning and at bedtime',
  },
]);
assert.equal(created.creates.length, 1);
assert.equal(created.creates[0].doc.privacy, 'private');
assert.equal(created.questions[0]?.state.kind, 'isMedicine');
assert.notEqual(created.creates[0].doc.careAskedAt, null);
assert.equal(created.creates[0].doc.isCare, false);

const forMom = plan([
  {
    kind: 'createHabit',
    name: "Mom's walk",
    emoji: null,
    cadence: { kind: 'everyDay' },
    windows: [],
    timesPerDay: null,
    forWhoId: 'mom',
    isCare: false,
    isPrivate: false,
    words: '',
  },
]);
assert.equal(forMom.creates[0].doc.isCare, true);
assert.equal(forMom.questions.length, 0);

const careYes = planHabitAnswer({
  held: { kind: 'askCare', habitId: 'pills-pm' },
  optionId: 'yes',
  habits: base.habits,
  days: base.days,
  timeZone: 'UTC',
  profile: base.profile,
  at: NOW,
  now: NOW,
  captureId: 'cap-1',
  executionId: 'exec-3',
  newId,
  seal,
});
assert.equal(careYes?.effects[0].written.isCare, true);
assert.equal(careYes?.effects[0].written.privacy, 'private');
assert.equal(
  planHabitAnswer({
    held: { kind: 'askCare', habitId: 'pills-pm' },
    optionId: 'no',
    habits: base.habits,
    days: base.days,
    timeZone: 'UTC',
    profile: base.profile,
    at: NOW,
    now: NOW,
    captureId: 'cap-1',
    executionId: 'exec-3',
    newId,
    seal,
  }),
  null,
);

const retireCare = plan(
  [
    {
      kind: 'updateHabit',
      habitId: 'meds',
      change: 'retire',
      cadence: null,
      windows: null,
      until: null,
      requestQuote: 'retire it',
    },
  ],
  { habits: [careHabit] },
);
assert.equal(retireCare.effects.length, 0);
assert.equal(retireCare.notKept.length, 1);

const paused = plan([
  {
    kind: 'updateHabit',
    habitId: 'water',
    change: 'pause',
    cadence: null,
    windows: null,
    until: Date.UTC(2023, 10, 20),
    requestQuote: 'pause my water',
  },
]);
assert.equal(paused.updates[0].data.status, 'paused');
assert.equal(paused.updates[0].data.pausedUntil, Date.UTC(2023, 10, 20));
assert.equal(paused.effects[0].previous?.status, 'active');

assert.equal(plan([checkIn({})], { room: 0 }).effects.length, 0);
assert.equal(decideHabit(checkIn({})), 'automatic');

const answerQuestion = ambiguous.questions[0];
const resolved = planResolveHabit({
  questionId: 'q1',
  optionId: 'pills-am',
  by: 'tap',
  now: NOW,
  executionId: 'exec-4',
  captureId: 'cap-1',
  capture: {
    status: 'needsYou',
    createdAt: NOW,
    executionIds: [],
    questionState: { q1: answerQuestion.state },
  },
  opened: { questions: { q1: answerQuestion.sealed } },
  habits: base.habits,
  days: base.days,
  timeZone: 'UTC',
  profile: base.profile,
  newId,
  seal,
});
assert.equal(resolved.refused, null);
if (resolved.refused === null) {
  assert.equal(resolved.habit?.effects.length, 1);
  assert.equal(resolved.capture.status, 'sorted');
}
assert.equal(
  planResolveHabit({
    questionId: 'q1',
    optionId: 'nope',
    by: 'tap',
    now: NOW,
    executionId: 'e',
    captureId: 'cap-1',
    capture: {
      status: 'needsYou',
      createdAt: NOW,
      executionIds: [],
      questionState: { q1: answerQuestion.state },
    },
    opened: { questions: { q1: answerQuestion.sealed } },
    habits: base.habits,
    days: base.days,
    timeZone: 'UTC',
    profile: base.profile,
    newId,
    seal,
  }).refused,
  'unknown',
);

const habits = createAliasBook('h');
habits.add('pills-pm');
habits.add('water');
const read = (commands: Record<string, unknown>[], captureText: string) =>
  normalizeNomosReply({ commands, replyLine: null }, {
    reading,
    aliases: createAliasBook('t'),
    habits,
    captureText,
    timeZone: 'UTC',
    now: NOW,
  } as never);
const item = (fields: Record<string, unknown>) => ({
  ref: null,
  taskAlias: null,
  title: null,
  dueSpanId: null,
  isUrgent: null,
  scope: null,
  habitAlias: null,
  cadence: null,
  windows: null,
  timesPerDay: null,
  isCare: null,
  habitChange: null,
  windowKey: null,
  candidateAliases: null,
  checkDay: null,
  checkStatus: null,
  requestQuote: null,
  quote: null,
  ...fields,
});
const read1 = read(
  [
    item({
      kind: 'checkIn',
      candidateAliases: ['h1', 'h2', 'h9'],
      quote: 'felt dizzy',
    }),
    item({ kind: 'checkIn', habitAlias: 'h9' }),
    item({
      kind: 'updateHabit',
      habitAlias: 'h2',
      habitChange: 'pause',
      requestQuote: 'not what was said',
    }),
    item({
      kind: 'updateHabit',
      habitAlias: 'h2',
      habitChange: 'pause',
      requestQuote: 'pause my water',
    }),
    item({
      kind: 'createHabit',
      title: 'Vitamins',
      cadence: {
        kind: 'onWeekdays',
        weekdays: [1, 3],
        count: null,
        days: null,
      },
      windows: [
        { part: 'morning', startSpanId: null, endSpanId: null, label: null },
      ],
    }),
  ],
  'I took my pills, felt dizzy and pause my water, and start a habit of vitamins',
);
assert.equal(read1.habitCommands.length, 3);
assert.deepEqual((read1.habitCommands[0] as { habitIds: string[] }).habitIds, [
  'pills-pm',
  'water',
]);
assert.equal(
  (read1.habitCommands[0] as { note: string | null }).note,
  'felt dizzy',
);
assert.deepEqual(read1.habitDropped, ['habit-unknown', 'habit-unasked']);
assert.equal(
  (
    read(
      [item({ kind: 'checkIn', habitAlias: 'h1', quote: 'made up note' })],
      'I took my pills',
    ).habitCommands[0] as { note: string | null }
  ).note,
  null,
);

const todayState = toContextHabit(evening, EMPTY_HABIT_DAY, DAY_KEY);
const block = buildContext({
  text: 'I took my pills',
  reading,
  createdAt: NOW,
  timeZone: 'UTC',
  tasks: [],
  synced: [],
  habits: [todayState, toContextHabit(water, EMPTY_HABIT_DAY, DAY_KEY)],
} as never);
assert.match(block.message, /<habits>/);
assert.equal(block.habits.idOf('h1'), 'pills-pm');
assert.ok(!block.message.includes('pills-pm'));

const masked = maskContextRecords(
  { isOn: true, names: [], quoted: [] },
  {
    habits: [{ ...todayState, isPrivate: true }],
    synced: [],
  },
);
assert.equal(masked.habits?.[0].name, 'a private habit');
assert.ok(
  masked.habits?.[0].windows.every((window) => window.label === 'a time'),
);

const bare = (kind: string, fields: Record<string, unknown> = {}) =>
  item({ kind, habitAlias: 'h1', ...fields });
const drops = (fields: Record<string, unknown>, text: string) =>
  read([bare('checkIn', fields)], text);

// A write needs words that ask for it.
assert.deepEqual(
  drops({ checkDay: 'yesterday' }, 'I took my pills').habitDropped,
  ['habit-unasked'],
);
assert.equal(
  drops({ checkDay: 'yesterday' }, 'I took my pills last night').habitCommands
    .length,
  1,
);
assert.equal(
  drops({ checkDay: 'yesterday' }, 'I took my pills yesterday').habitCommands
    .length,
  1,
);
assert.deepEqual(
  drops({ checkStatus: 'skipped' }, 'I took my pills').habitDropped,
  ['habit-unasked'],
);
assert.equal(
  drops({ checkStatus: 'skipped' }, 'not today for the pills').habitCommands
    .length,
  1,
);
assert.deepEqual(
  drops({}, 'the weather is nice and the dog barked').habitDropped,
  ['habit-unasked'],
);
assert.deepEqual(
  read(
    [item({ kind: 'createHabit', title: 'Walk the dog' })],
    'every morning I walk the dog',
  ).habitDropped,
  ['habit-unasked'],
);
assert.equal(
  read(
    [item({ kind: 'createHabit', title: 'Vitamins' })],
    'start a habit of vitamins',
  ).habitCommands.length,
  1,
);
const named = createAliasBook('h');
named.add('pills-pm');
assert.equal(
  normalizeNomosReply({ commands: [bare('checkIn')], replyLine: null }, {
    reading,
    aliases: createAliasBook('t'),
    habits: named,
    habitNames: new Map([['pills-pm', 'Evening pills']]),
    captureText: 'pills again',
    timeZone: 'UTC',
    now: NOW,
  } as never).habitCommands.length,
  1,
);

// A note is the capture's own slice, letters and punctuation as said.
const verbatim = read(
  [item({ kind: 'checkIn', habitAlias: 'h1', quote: 'felt dizzy' })],
  'I took my pills - felt  DIZZY!',
).habitCommands[0] as { note: string | null };
assert.equal(verbatim.note, 'felt DIZZY');

// Private in effect: a care habit counts even when its class reads ordinary.
const quietCare = habit({ ...evening, id: 'quiet', isCare: true });
assert.equal(isPrivateHabit(quietCare), true);
assert.equal(
  toContextHabit(quietCare, EMPTY_HABIT_DAY, DAY_KEY).isPrivate,
  true,
);
const quietPlan = plan([checkIn({ habitIds: ['quiet'] })], {
  habits: [quietCare],
  isUnattended: true,
});
assert.equal(quietPlan.isPrivate, true);
assert.ok(quietPlan.lines.every((line) => !/evening pills/i.test(line)));

// A private habit made while the screen is out of sight is not named.
const hiddenCreate = plan(
  [
    {
      kind: 'createHabit',
      name: 'Sertraline',
      emoji: null,
      cadence: { kind: 'everyDay' },
      windows: [],
      timesPerDay: null,
      forWhoId: null,
      isCare: true,
      isPrivate: false,
      words: 'a habit of sertraline',
    },
  ],
  { isUnattended: true },
);
assert.equal(hiddenCreate.lines[0], 'Started private habit');

// A habit made earlier in the turn counts: a second one with the name is not made.
const dup = plan(
  ['Walk', 'walk'].map((name) => ({
    kind: 'createHabit' as const,
    name,
    emoji: null,
    cadence: { kind: 'everyDay' as const },
    windows: [],
    timesPerDay: null,
    forWhoId: null,
    isCare: false,
    isPrivate: false,
    words: 'a habit of walk',
  })),
);
assert.equal(dup.creates.length, 1);
assert.equal(dup.notKept.length, 1);

// A window cannot start before the rollover.
const early = plan([
  {
    kind: 'createHabit',
    name: 'Night snack',
    emoji: null,
    cadence: { kind: 'everyDay' },
    windows: [{ part: null, start: '01:00', end: null, label: null }],
    timesPerDay: null,
    forWhoId: null,
    isCare: false,
    isPrivate: false,
    words: 'a habit',
  },
]);
assert.ok(
  Object.values(
    early.creates[0].doc.windowState as Record<string, { start: string }>,
  ).every((window) => window.start >= '03:00'),
);

// An undo restores what was really there: the stored status and the earlier edit time.
const wasPaused = habit({
  ...water,
  status: 'active',
  storedStatus: 'paused',
  pausedUntil: Date.UTC(2023, 10, 1),
  lastEditedAt: 4242,
});
const pausedAgain = plan(
  [
    {
      kind: 'updateHabit',
      habitId: 'water',
      change: 'pause',
      cadence: null,
      windows: null,
      until: null,
      requestQuote: 'pause my water',
    },
  ],
  { habits: [wasPaused] },
);
assert.equal(pausedAgain.effects[0].previous?.status, 'paused');
assert.equal(pausedAgain.effects[0].previous?.lastEditedAt, 4242);

// "How was it?" is for today.
assert.equal(plan([checkIn({ day: 'yesterday' })]).followUp, null);

// A note over an earlier one keeps it; a day whose notes did not open is left alone.
const earlier: LiveHabitDay = {
  ...EMPTY_HABIT_DAY,
  exists: true,
  notes: { 'pills-pm/w1': { text: 'first', at: 1, captureId: 'cap-0' } },
};
const second = plan([checkIn({ note: 'second' })], {
  days: new Map([[DAY_KEY, earlier]]),
});
const sealedNotes = second.dayWrites[0].sealed as unknown as {
  notes: Record<string, { text: string }>;
};
assert.equal(sealedNotes.notes['pills-pm/w1'].text, 'first');
assert.equal(sealedNotes.notes['pills-pm/w1#2'].text, 'second');
const locked = plan([checkIn({ note: 'second' })], {
  days: new Map([
    [
      DAY_KEY,
      {
        ...EMPTY_HABIT_DAY,
        exists: true,
        isNotesUnreadable: true,
      },
    ],
  ]),
});
assert.equal(locked.dayWrites[0].sealed, null);
assert.deepEqual(locked.dayWrites[0].noteKeys, []);

// Two tallies on one habit in a turn are one increment of two.
const written: Record<string, unknown>[] = [];
writeHabitDayIn(
  {
    set: (_ref: unknown, data: Record<string, unknown>) => written.push(data),
  } as never,
  {} as never,
  {
    ...tally.dayWrites[0],
    sealed: null,
  },
);
const counted = (written[0].entries as Record<string, { count: unknown }>).water
  .count;
assert.deepEqual(JSON.parse(JSON.stringify(counted)), { operand: 2 });

// The habit prompt and list go only to a turn about habits.
const mine = [{ name: 'Evening pills' }, { name: 'Stretch for ten minutes' }];
assert.equal(isHabitTurn('buy milk every day', 'today', mine), false);
assert.equal(isHabitTurn('call the dentist weekly', null, mine), false);
assert.equal(isHabitTurn('remind me to buy milk', null, []), false);
assert.equal(isHabitTurn('start a habit of reading', null, []), true);
assert.equal(isHabitTurn('I took my vitamins', null, []), true);
assert.equal(isHabitTurn('I took the dog out', null, mine), true);
assert.equal(isHabitTurn('I took the dog out', null, []), false);
assert.equal(isHabitTurn('stretch more', null, mine), true);
assert.equal(isHabitTurn('what is on today', 'habits', mine), true);
assert.equal(isHabitTurn('what is on today', 'habit', []), true);

console.log('helm habit commands: ok');
