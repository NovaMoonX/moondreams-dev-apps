import assert from 'node:assert/strict';

import {
  describeAmounts,
  describeTimersLeft,
  formatSpokenTime,
  normalizeTranscript,
  parseCookCommand,
  describeTimerGuess,
  describeTimerQuestion,
  getTimerChoiceNames,
  pickTimersToTell,
  readCookCommand,
  resolveVoiceTimers,
  readSpokenDuration,
  toSingular,
  toSpokenAmount,
  toSpokenLabel,
  type CookCommand,
  type CookTimerTarget,
  type CookVoiceChoice,
  type CookVoiceContext,
} from '../../src/apps/pinch/utils/cookVoice.ts';

const plate: CookVoiceContext = {
  recipes: [
    { id: 'adobo', title: 'Adobo chicken' },
    { id: 'rice', title: 'Cilantro lime rice' },
    { id: 'soup', title: 'Chicken noodle soup' },
  ],
  shownRecipeId: 'adobo',
  lines: [
    { id: 'thigh', names: ['Chicken thigh', 'chicken thighs'], isInStep: true },
    { id: 'soy', names: ['Soy sauce', 'shoyu'], isInStep: true },
    { id: 'garlic', names: ['Garlic'], isInStep: true },
    { id: 'powder', names: ['Garlic powder'], isInStep: false },
    { id: 'chili', names: ['Chili powder'], isInStep: false },
    { id: 'bay', names: ['Bay leaf'], isInStep: false },
    { id: 'tomato', names: ['Tomato'], isInStep: false },
    { id: 'jalapeno', names: ['Jalapeño'], isInStep: false },
    { id: 'rice-line', names: ['Jasmine rice'], isInStep: false },
    { id: 'vinegar', names: ['White vinegar'], isInStep: false },
    { id: 'coconut', names: ['Coconut milk'], isInStep: false },
    { id: 'tartar', names: ['Cream of tartar'], isInStep: false },
  ],
  timers: [],
  choice: null,
};

const single: CookVoiceContext = {
  ...plate,
  recipes: [{ id: 'adobo', title: 'Adobo chicken' }],
};

const parse = (text: string | string[], context = plate) =>
  parseCookCommand(text, context);

const expectKind = (
  phrases: string[],
  expected: CookCommand,
  message: string,
) =>
  phrases.forEach((phrase) =>
    assert.deepEqual(parse(phrase), expected, `${message}: "${phrase}"`),
  );

assert.equal(
  normalizeTranscript('  Okay, Pinch… NEXT step, please! '),
  'next step',
  'a lead-in, punctuation, case and a trailing please are dropped',
);
assert.equal(
  normalizeTranscript('Crème fraîche?'),
  'creme fraiche',
  'accents come off',
);

expectKind(
  [
    'next',
    'Next.',
    'NEXT STEP',
    'okay next',
    'OK, next!',
    'hey pinch next',
    'next please',
    'go to the next step',
  ],
  { kind: 'NEXT' },
  'every way to say next is next',
);
expectKind(
  ['back', 'go back', 'previous', 'previous step', 'Back one.'],
  { kind: 'BACK' },
  'every way to say back is back',
);
expectKind(
  ['repeat', 'repeat that', 'read it', 'read the step', 'read it again'],
  { kind: 'REPEAT' },
  'every way to ask again reads the step',
);
expectKind(
  ['ingredients', 'show ingredients', 'show me the ingredients'],
  { kind: 'SHOW_INGREDIENTS' },
  'asking for the ingredients shows them',
);
expectKind(
  ['steps', 'show steps', 'back to the steps'],
  { kind: 'SHOW_STEPS' },
  'asking for the steps shows them',
);
expectKind(
  [
    'stop listening',
    'turn off voice',
    'voice off',
    'turn off the mic',
    'okay stop listening',
  ],
  { kind: 'STOP_LISTENING' },
  'every way to turn voice off turns it off',
);
const anyTimer: CookTimerTarget = { seconds: null, name: null, isAll: false };
expectKind(
  [
    'how much time is left',
    'how much time left',
    'time left',
    'how long is left on the timer',
    "what's the timer at",
  ],
  { kind: 'TIME_LEFT', target: anyTimer },
  'asking how long is the time-left question',
);
assert.deepEqual(
  parse('how much time is left on the ten minute timer'),
  { kind: 'TIME_LEFT', target: { ...anyTimer, seconds: 600 } },
  'a length said with the question picks the timer it asks about',
);

expectKind(
  ['start the timer', 'start timer', 'Start a timer.', 'start the timer again'],
  { kind: 'START_TIMER', seconds: null, name: null },
  'start the timer starts the step timer',
);
expectKind(
  [
    'start the ten minute timer',
    'start the 10 minute timer',
    'start the 10-minute timer',
    'set a timer for 10 minutes',
    'start timer for ten minutes',
  ],
  { kind: 'START_TIMER', seconds: 600, name: null },
  'a length said with the timer picks the timer of that length',
);
expectKind(
  ['start the twenty five minute timer', 'start the twenty-five minute timer'],
  { kind: 'START_TIMER', seconds: 1500, name: null },
  'tens and ones said as words make one number',
);
expectKind(
  ['start the half an hour timer', 'start the thirty minute timer'],
  { kind: 'START_TIMER', seconds: 1800, name: null },
  'half an hour is thirty minutes',
);
expectKind(
  ['start the quarter of an hour timer', 'start the fifteen minute timer'],
  { kind: 'START_TIMER', seconds: 900, name: null },
  'a quarter of an hour is fifteen minutes',
);
expectKind(
  ['start the hour and a half timer', 'start the one and a half hour timer'],
  { kind: 'START_TIMER', seconds: 5400, name: null },
  'an hour and a half is ninety minutes',
);
expectKind(
  ['pause', 'pause the timer', 'pause timer', 'hold the timer'],
  { kind: 'PAUSE_TIMER', target: anyTimer },
  'pause pauses the timer',
);
expectKind(
  ['resume', 'resume the timer', 'unpause', 'continue the timer'],
  { kind: 'RESUME_TIMER', target: anyTimer },
  'resume resumes the timer',
);
expectKind(
  ['stop', 'dismiss', 'silence', 'stop the alarm', 'silence the alarm'],
  { kind: 'STOP_TIMER', target: anyTimer, scope: 'RINGING' },
  'a bare stop or the alarm only silences a ringing timer',
);
expectKind(
  [
    'stop the timer',
    'dismiss the timer',
    'silence the timer',
    'cancel the timer',
    'reset the timer',
    'turn off the timer',
  ],
  { kind: 'STOP_TIMER', target: anyTimer, scope: 'ANY' },
  'stop the timer stops one that is going',
);
assert.deepEqual(
  parse('stop the 10 minute timer'),
  { kind: 'STOP_TIMER', target: { ...anyTimer, seconds: 600 }, scope: 'ANY' },
  'a length picks which timer to stop',
);
assert.deepEqual(
  parse('pause the twenty minute timer'),
  { kind: 'PAUSE_TIMER', target: { ...anyTimer, seconds: 1200 } },
  'a length picks which timer to pause',
);

[
  "I'll go next door",
  'the next batch',
  'next time use less salt',
  'back of the pan',
  'put it back',
  'pause for effect',
  'stop it',
  'stop that',
  'start',
  'start the oven',
  'set the table',
  'hold on',
  'turn off the stove',
  'clear',
  'how much',
  'how much do you want',
  'how much does it cost',
  'how much is that',
  'how many people are coming',
  'show me the money',
  'go to the store',
  'switch to the big pan',
  'okay',
  'pinch',
  'hey',
  'go on',
  'keep going',
  'continue',
  'forward',
  'move on',
  'again',
  'come again',
  'what was that',
  'say that again',
  'method',
  'instructions',
  'what do I need',
  'how long',
  'how much longer',
  "what's left",
  'the other dish',
  'quiet',
  'mute',
  'step back',
  'cook the chicken',
  'do the chicken',
  'cook rice',
  'do rice',
  'open rice',
  'skip to rice',
  'jump to rice',
  'move to rice',
  'change to rice',
  'show rice',
  '',
  'next next next next next next next next next next next next next next next next next next next next',
].forEach((phrase) =>
  assert.equal(
    parse(phrase),
    null,
    `kitchen talk is not a command: "${phrase}"`,
  ),
);

assert.deepEqual(
  parse('how much garlic'),
  { kind: 'AMOUNT', query: 'garlic', lineIds: ['garlic'] },
  '"garlic" is the garlic, not the garlic powder',
);
assert.deepEqual(
  parse('how much garlic powder do I need'),
  { kind: 'AMOUNT', query: 'garlic powder', lineIds: ['powder'] },
  '"garlic powder" is the garlic powder, and a trailing "do I need" is dropped',
);
assert.deepEqual(
  parse('how much powder'),
  { kind: 'AMOUNT', query: 'powder', lineIds: ['powder', 'chili'] },
  'a word two lines share answers with both',
);
assert.deepEqual(
  parse('how much chicken'),
  { kind: 'AMOUNT', query: 'chicken', lineIds: ['thigh'] },
  'one word of a longer name finds it',
);
assert.deepEqual(
  parse('How many chicken thighs?'),
  { kind: 'AMOUNT', query: 'chicken thighs', lineIds: ['thigh'] },
  'a plural finds its singular name',
);
assert.deepEqual(
  parse('how many bay leaves'),
  { kind: 'AMOUNT', query: 'bay leaves', lineIds: ['bay'] },
  'leaves finds leaf',
);
assert.deepEqual(
  parse('how many tomatoes'),
  { kind: 'AMOUNT', query: 'tomatoes', lineIds: ['tomato'] },
  'tomatoes finds tomato',
);
assert.deepEqual(
  parse('how much jalapeno'),
  { kind: 'AMOUNT', query: 'jalapeno', lineIds: ['jalapeno'] },
  'a name with an accent is found without it',
);
assert.deepEqual(
  parse('how much shoyu'),
  { kind: 'AMOUNT', query: 'shoyu', lineIds: ['soy'] },
  'another name an ingredient goes by finds it',
);
assert.deepEqual(
  parse('how much of the soy sauce'),
  { kind: 'AMOUNT', query: 'soy sauce', lineIds: ['soy'] },
  '"of the" before the name is dropped',
);
assert.deepEqual(
  parse('how much cilantro'),
  { kind: 'AMOUNT', query: 'cilantro', lineIds: [] },
  'an ingredient the recipe lacks is still the question, with nothing found',
);
assert.deepEqual(
  parse('how much garlic', {
    ...plate,
    lines: [
      { id: 'garlic-a', names: ['Garlic'], isInStep: false },
      { id: 'garlic-b', names: ['Garlic'], isInStep: true },
    ],
  }),
  { kind: 'AMOUNT', query: 'garlic', lineIds: ['garlic-b'] },
  'when two lines match as well, the one this step names wins',
);

assert.deepEqual(
  parse('switch to rice'),
  { kind: 'SWITCH_RECIPE', recipeId: 'rice', candidates: ['rice'] },
  'one word of a title switches to it',
);
assert.deepEqual(
  parse('go to the cilantro rice'),
  { kind: 'SWITCH_RECIPE', recipeId: 'rice', candidates: ['rice'] },
  'a few words of a title switch to it',
);
assert.deepEqual(
  parse('show me the soup'),
  { kind: 'SWITCH_RECIPE', recipeId: 'soup', candidates: ['soup'] },
  '"show me" with a title switches to it',
);
assert.deepEqual(
  parse('switch to chicken'),
  { kind: 'SWITCH_RECIPE', recipeId: 'soup', candidates: ['adobo', 'soup'] },
  'a word two titles share goes to the one that is not on screen',
);
assert.deepEqual(
  parse('switch to chicken', { ...plate, shownRecipeId: 'rice' }),
  { kind: 'SWITCH_RECIPE', recipeId: null, candidates: ['adobo', 'soup'] },
  'a word two other titles share asks which',
);
assert.deepEqual(
  parse('Switch to ADOBO.'),
  { kind: 'SWITCH_RECIPE', recipeId: 'adobo', candidates: ['adobo'] },
  'case and punctuation do not matter for a title',
);
expectKind(
  ['finish', 'Done.', "I'm done", 'mark as cooked'],
  { kind: 'FINISH' },
  'every phrase that names finishing is the finish question, so it can be refused in words',
);
expectKind(
  ['next recipe', 'next dish', 'switch recipe'],
  { kind: 'CYCLE_RECIPE', direction: 1 },
  'next recipe moves to the next dish',
);
assert.deepEqual(
  parse('previous recipe'),
  { kind: 'CYCLE_RECIPE', direction: -1 },
  'previous recipe moves back a dish',
);
assert.deepEqual(
  parse('switch to rice', single),
  null,
  'a title that is not on screen is not a command',
);

const bigKitchen: CookVoiceContext = {
  recipes: Array.from({ length: 6 }, (_, at) => ({
    id: `recipe-${at}`,
    title: `Batch ${at} stew`,
  })),
  shownRecipeId: 'recipe-0',
  lines: [
    ...Array.from({ length: 48 }, (_, at) => ({
      id: `line-${at}`,
      names: [`Spice blend ${at}`],
      isInStep: at % 7 === 0,
    })),
    { id: 'garlic', names: ['Garlic'], isInStep: false },
    { id: 'garlic-salt', names: ['Garlic salt'], isInStep: true },
  ],
};
assert.deepEqual(
  [
    parse('how much garlic', bigKitchen),
    parse('how much spice blend 41', bigKitchen),
    parse('switch to batch 4', bigKitchen),
  ],
  [
    { kind: 'AMOUNT', query: 'garlic', lineIds: ['garlic'] },
    { kind: 'AMOUNT', query: 'spice blend 41', lineIds: ['line-41'] },
    {
      kind: 'SWITCH_RECIPE',
      recipeId: 'recipe-4',
      candidates: ['recipe-4'],
    },
  ],
  'with 50 lines and 6 dishes, the exact name still wins over a longer one this step names',
);

[
  ["I'll go next door", 'next'],
  ['text', 'necks', 'next'],
  ['black', 'back', 'pack'],
  ['pours', 'pause'],
  ['necks', 'next'],
  ['rapids', 'repeat'],
  ['dun', 'done'],
  ['next door', 'the next batch'],
].forEach((guesses) =>
  assert.equal(
    parse(guesses),
    null,
    `a one-word command or a move in a lower-ranked guess never acts: ${JSON.stringify(guesses)}`,
  ),
);
assert.deepEqual(
  [
    readCookCommand(['switch to rise', 'switch to rice'], plate),
    readCookCommand(['stop the time', 'stop the timer'], plate),
    readCookCommand(['how much garlic', 'how much garlic powder'], plate),
  ],
  [
    {
      command: {
        kind: 'SWITCH_RECIPE',
        recipeId: 'rice',
        candidates: ['rice'],
      },
      transcript: 'switch to rice',
    },
    {
      command: { kind: 'STOP_TIMER', target: anyTimer, scope: 'ANY' },
      transcript: 'stop the timer',
    },
    {
      command: { kind: 'AMOUNT', query: 'garlic', lineIds: ['garlic'] },
      transcript: 'how much garlic',
    },
  ],
  'a longer phrase in a lower-ranked guess counts, and the top guess wins when it is a command; the line names the guess that acted',
);

assert.deepEqual(
  [
    parse('how many cups of rice'),
    parse('how many tablespoons of vinegar'),
    parse('how many cloves of garlic'),
    parse('how many fluid ounces of coconut milk'),
    parse('how much cream of tartar'),
    parse('how many cups of tomatoes'),
  ],
  [
    { kind: 'AMOUNT', query: 'cups of rice', lineIds: ['rice-line'] },
    { kind: 'AMOUNT', query: 'tablespoons of vinegar', lineIds: ['vinegar'] },
    { kind: 'AMOUNT', query: 'cloves of garlic', lineIds: ['garlic'] },
    {
      kind: 'AMOUNT',
      query: 'fluid ounces of coconut milk',
      lineIds: ['coconut'],
    },
    { kind: 'AMOUNT', query: 'cream of tartar', lineIds: ['tartar'] },
    { kind: 'AMOUNT', query: 'cups of tomatoes', lineIds: ['tomato'] },
  ],
  'a quantity before the ingredient ("cups of", "cloves of") is looked past, a plural still matches, and a name with "of" in it is kept whole',
);
assert.deepEqual(
  [
    parse('how many cups of cilantro'),
    parse('how many people'),
    parse('how many minutes'),
  ],
  [
    { kind: 'AMOUNT', query: 'cups of cilantro', lineIds: [] },
    { kind: 'AMOUNT', query: 'people', lineIds: [] },
    { kind: 'AMOUNT', query: 'minutes', lineIds: [] },
  ],
  'a question with nothing found keeps the words searched, so the answer can name them',
);

assert.deepEqual(
  [
    readSpokenDuration('ten minute'),
    readSpokenDuration('1 hour 30 minutes'),
    readSpokenDuration('forty five seconds'),
    readSpokenDuration('a minute'),
    readSpokenDuration('big'),
    readSpokenDuration('10 minute big'),
  ],
  [600, 5400, 45, 60, null, null],
  'a spoken length is read only when it is nothing but a length',
);
assert.deepEqual(
  ['tomatoes', 'leaves', 'peaches', 'cheeses', 'glass', 'rice', 'berries'].map(
    toSingular,
  ),
  ['tomato', 'leaf', 'peach', 'cheese', 'glass', 'rice', 'berry'],
  'common recipe plurals become singular',
);

assert.deepEqual(
  [
    toSpokenAmount('1½ tbsp'),
    toSpokenAmount('¼ cup'),
    toSpokenAmount('1 tsp'),
    toSpokenAmount('2 lb'),
    toSpokenAmount('about 2½ oz'),
    toSpokenAmount('6'),
    toSpokenAmount('1½ cups'),
    toSpokenAmount('a pinch'),
    toSpokenAmount('to taste'),
  ],
  [
    '1 and a half tablespoons',
    'a quarter cup',
    '1 teaspoon',
    '2 pounds',
    'about 2 and a half ounces',
    '6',
    '1 and a half cups',
    'a pinch',
    'to taste',
  ],
  'amounts are read out in words, never as glyphs or abbreviations',
);
assert.deepEqual(
  [
    formatSpokenTime(12 * 60_000 + 20_000),
    formatSpokenTime(90_000),
    formatSpokenTime(45_000),
    formatSpokenTime(3_600_000 + 5 * 60_000),
    formatSpokenTime(0),
    formatSpokenTime(60_000),
    formatSpokenTime(150_000),
    formatSpokenTime(599_000),
    formatSpokenTime(12 * 60_000 + 50_000),
  ],
  [
    '12 minutes',
    '1 minute 30 seconds',
    '45 seconds',
    '1 hour 5 minutes',
    '0 seconds',
    '1 minute',
    '2 minutes 30 seconds',
    '9 minutes 59 seconds',
    '12 minutes',
  ],
  'a time left is never said as more than is left: seconds under ten minutes, whole minutes from there',
);
assert.deepEqual(
  ['30 min', '1 h 30 min', '1 min 30 sec', '2 h', '1 h 1 min', '45 sec'].map(
    toSpokenLabel,
  ),
  [
    '30 minute',
    '1 hour 30 minutes',
    '1 minute 30 seconds',
    '2 hour',
    '1 hour 1 minute',
    '45 second',
  ],
  'a timer\'s length is said as "the 30 minute timer", and a length in two units agrees with its numbers',
);
assert.deepEqual(
  describeTimersLeft([
    {
      label: '30 min',
      name: 'Marinate the chicken',
      status: 'running',
      remainingMs: 750_000,
      clock: '12:30',
    },
  ]),
  {
    show: '12:30 left on the 30 min timer',
    speak: '12 minutes left on the 30 minute timer.',
  },
  'one timer is named by its length, said in whole words',
);
assert.deepEqual(
  describeTimersLeft([
    {
      label: '10 min',
      name: 'Pasta water',
      callName: 'Pasta water',
      status: 'running',
      remainingMs: 540_000,
      clock: '9:00',
    },
  ]),
  {
    show: '9:00 left on the Pasta water timer',
    speak: '9 minutes left on the Pasta water timer.',
  },
  'a timer the person named is told by its name, not its length',
);
assert.deepEqual(
  describeTimersLeft(
    [
      {
        label: '10 min',
        name: 'A',
        status: 'running',
        remainingMs: 60_000,
        clock: '1:00',
      },
      {
        label: '5 min',
        name: 'B',
        status: 'paused',
        remainingMs: 30_000,
        clock: '0:30',
      },
    ],
    3,
  ),
  {
    show: '1:00 left · 0:30 left, paused · and 3 more',
    speak: 'A: 1 minute left. B: 30 seconds left, paused. And 3 more.',
  },
  'a long list of timers is told in part, with how many were left out',
);
assert.deepEqual(
  describeTimersLeft([
    {
      label: '30 min',
      name: 'Marinate',
      status: 'paused',
      remainingMs: 90_000,
      clock: '1:30',
    },
    {
      label: '15 min',
      name: 'Rice · Simmer',
      status: 'done',
      remainingMs: 0,
      clock: '0:00',
    },
  ]),
  {
    show: '1:30 left, paused · Done',
    speak: 'Marinate: 1 minute 30 seconds left, paused. Rice · Simmer is done.',
  },
  'several timers are each named aloud, with paused and done said; the line shows their clocks',
);
assert.deepEqual(
  describeTimersLeft([
    {
      label: '25 min',
      name: 'Add the vinegar',
      status: 'running',
      remainingMs: 1_499_000,
      clock: '24:59',
    },
    {
      label: '30 min',
      name: 'Marinate the chicken',
      status: 'running',
      remainingMs: 1_795_000,
      clock: '29:55',
    },
  ]).show,
  '24:59 and 29:55 left',
  'two running timers fit one line as their clocks, since the pills name them',
);
assert.deepEqual(
  describeAmounts([
    { name: 'Garlic', amountText: '6' },
    { name: 'Soy sauce', amountText: '¼ cup' },
  ]),
  {
    show: 'Garlic: 6; Soy sauce: ¼ cup',
    speak: 'Garlic, 6. Soy sauce, a quarter cup.',
  },
  'amounts are shown as written and said in words',
);
assert.deepEqual(
  describeAmounts([
    { name: 'Garlic', amountText: '4' },
    { name: 'Garlic', amountText: '½ tsp' },
  ]),
  {
    show: 'Garlic: 4, ½ tsp',
    speak: 'Garlic, 4, plus a half teaspoon.',
  },
  'a name on two lines is said once with both amounts',
);
assert.deepEqual(
  describeAmounts([
    { name: 'Garlic', amountText: '4', groupLabel: 'For the chicken' },
    { name: 'Garlic', amountText: '2', groupLabel: 'For the sauce' },
  ]),
  {
    show: 'Garlic: 4 (For the chicken), 2 (For the sauce)',
    speak: 'Garlic, 4, For the chicken, plus 2, For the sauce.',
  },
  'an ingredient in two groups says which group each amount is for',
);

const timerSet = [
  {
    id: 'a',
    label: '30 min',
    status: 'running',
    remainingMs: 900_000,
    names: ['Marinate'],
  },
  {
    id: 'b',
    label: '10 min',
    status: 'running',
    remainingMs: 120_000,
    names: ['Pasta water'],
  },
  {
    id: 'c',
    label: '25 min',
    status: 'paused',
    remainingMs: 600_000,
    names: ['Simmer sauce'],
  },
  {
    id: 'd',
    label: '5 min',
    status: 'done',
    remainingMs: 0,
    names: ['Rest steak'],
  },
];
const resolve = (
  statuses: string[],
  target: Partial<CookTimerTarget>,
  focusedId: string | null = null,
  timers = timerSet,
) =>
  resolveVoiceTimers(timers, {
    statuses,
    target: { ...anyTimer, ...target },
    focusedId,
  });
const idOf = (resolution: ReturnType<typeof resolve>) =>
  resolution.kind === 'ONE' ? resolution.timer.id : resolution.kind;
assert.deepEqual(
  [
    idOf(resolve(['running'], {}, 'a')),
    idOf(resolve(['running'], {}, null)),
    idOf(resolve(['running'], {}, 'c')),
    idOf(resolve(['running'], { seconds: 1800 })),
    idOf(resolve(['paused'], {})),
    idOf(resolve(['running'], { seconds: 1500 })),
    idOf(resolve(['running'], { name: 'pasta' })),
    idOf(resolve(['running'], { name: 'sauce' })),
    idOf(resolve(['running', 'paused'], { name: 'sauce' })),
    idOf(resolve(['running'], { isAll: true })),
    idOf(resolve([], {})),
  ],
  ['a', 'ASK', 'ASK', 'a', 'c', 'NONE', 'b', 'ASK', 'c', 'ALL', 'NONE'],
  'a timer is found by what is said (length, name, all) or the one in front on screen, the only one that fits is taken, and with several that fit and nothing to tell them apart it asks instead of picking',
);
assert.deepEqual(
  [
    idOf(resolve(['running'], { seconds: 600 }, 'a')),
    idOf(
      resolve(['running', 'paused'], { seconds: 600 }, null, [
        ...timerSet,
        {
          id: 'e',
          label: '10 min',
          status: 'running',
          remainingMs: 300_000,
          names: ['Boil eggs'],
        },
      ]),
    ),
  ],
  ['b', 'ASK'],
  'a said length that fits two timers asks, and one in focus is no reason to skip the question when the person named something',
);
assert.deepEqual(
  [
    pickTimersToTell(timerSet, 'a').map((timer) => timer.id),
    pickTimersToTell(timerSet, 'c').map((timer) => timer.id),
    pickTimersToTell(timerSet, null).map((timer) => timer.id),
    pickTimersToTell(timerSet.slice(0, 1), null).map((timer) => timer.id),
    pickTimersToTell([], null),
  ],
  [['a', 'b'], ['c', 'b'], ['d', 'b'], ['a'], []],
  'time left tells the timer in focus (else a finished one, else the soonest), then the soonest other running one',
);

const rangSet = [
  {
    id: 'late',
    label: '30 min',
    status: 'done',
    remainingMs: 0,
    endedAt: 2_000,
    names: ['Rice'],
  },
  {
    id: 'run',
    label: '5 min',
    status: 'running',
    remainingMs: 60_000,
    names: ['Eggs'],
  },
  {
    id: 'early',
    label: '10 min',
    status: 'done',
    remainingMs: 0,
    endedAt: 1_000,
    names: ['Pasta'],
  },
];
assert.deepEqual(
  [
    idOf(resolve(['done'], {}, null, rangSet)),
    idOf(resolve(['done'], {}, 'late', rangSet)),
    idOf(resolve(['done'], { seconds: 1800 }, null, rangSet)),
    pickTimersToTell(rangSet, null).map((timer) => timer.id),
  ],
  ['early', 'late', 'late', ['early', 'run']],
  'with two Time’s ups listed latest first, stop and time left take the one in focus, else the one that rang first, unless another is named',
);

const timerContext: CookVoiceContext = {
  ...plate,
  timers: [
    { id: 't1', names: ['Pasta water'], label: '10 min' },
    { id: 't2', names: ['Rice'], label: '15 min' },
    { id: 't3', names: ['Boil eggs'], label: '10 min' },
  ],
};
assert.equal(
  parse('add a minute'),
  null,
  'with no timer in the session, adding time is not a command',
);
const parseWithTimers = (text: string, context = timerContext) =>
  parse(text, context);
const target = (part: Partial<CookTimerTarget>): CookTimerTarget => ({
  ...anyTimer,
  ...part,
});

[
  ['set a timer for ten minutes for the pasta', 600, 'pasta'],
  ['set a pasta timer for 10 minutes', 600, 'pasta'],
  ['start a 10 minute timer for the rice', 600, 'rice'],
  ['set a timer for the pasta', null, 'pasta'],
  ['start a timer called garlic bread for five minutes', 300, 'garlic bread'],
].forEach(([phrase, seconds, name]) =>
  assert.deepEqual(
    parseWithTimers(phrase as string),
    { kind: 'START_TIMER', seconds, name },
    `a new timer takes the length and the name said with it: "${phrase}"`,
  ),
);
assert.deepEqual(
  parseWithTimers('set a timer'),
  { kind: 'START_TIMER', seconds: null, name: null },
  'a timer with no length or name is still a start, and the screen asks how long',
);

[
  ['pause the pasta timer', 'PAUSE_TIMER'],
  ['pause the pasta', 'PAUSE_TIMER'],
  ['resume the rice timer', 'RESUME_TIMER'],
].forEach(([phrase, kind]) =>
  assert.deepEqual(
    parseWithTimers(phrase),
    {
      kind,
      target: target({ name: phrase.includes('pasta') ? 'pasta' : 'rice' }),
    },
    `a name said with a timer verb picks the timer called that: "${phrase}"`,
  ),
);
assert.deepEqual(
  parseWithTimers('stop the rice'),
  { kind: 'STOP_TIMER', target: target({ name: 'rice' }), scope: 'ANY' },
  'a name that is a timer needs no "timer" after it',
);
['pause all timers', 'pause the timers', 'pause all the timers'].forEach(
  (phrase) =>
    assert.deepEqual(
      parseWithTimers(phrase),
      { kind: 'PAUSE_TIMER', target: target({ isAll: true }) },
      `all pauses every timer: "${phrase}"`,
    ),
);
assert.deepEqual(
  [parseWithTimers('cancel all timers'), parseWithTimers('dismiss all')],
  [
    { kind: 'STOP_TIMER', target: target({ isAll: true }), scope: 'ANY' },
    { kind: 'STOP_TIMER', target: target({ isAll: true }), scope: 'ANY' },
  ],
  'all stops every timer',
);

[
  ['add two minutes', 120, null],
  ['add a minute', 60, null],
  ['add 2 minutes to the pasta timer', 120, 'pasta'],
  ['extend the timer by five minutes', 300, null],
  ['give the rice timer 3 more minutes', 180, 'rice'],
  ['five more minutes', 300, null],
  ['another 5 minutes', 300, null],
  ['two more minutes on the rice', 120, 'rice'],
].forEach(([phrase, seconds, name]) =>
  assert.deepEqual(
    parseWithTimers(phrase as string),
    {
      kind: 'EXTEND_TIMER',
      seconds,
      target: target({ name: name as string | null }),
    },
    `time is added to the timer said, or the one in front: "${phrase}"`,
  ),
);

assert.deepEqual(
  [
    'how much time is left on the pasta',
    'how much time is left on the pasta timer',
    'how long on the rice',
  ].map((phrase) => parseWithTimers(phrase)),
  [
    { kind: 'TIME_LEFT', target: target({ name: 'pasta' }) },
    { kind: 'TIME_LEFT', target: target({ name: 'pasta' }) },
    { kind: 'TIME_LEFT', target: target({ name: 'rice' }) },
  ],
  'time left can be asked about one timer by name',
);
assert.deepEqual(
  [
    'what timers are running',
    'how much time is left on all the timers',
    'list the timers',
  ].map((phrase) => parseWithTimers(phrase)),
  Array.from({ length: 3 }, () => ({
    kind: 'TIME_LEFT',
    target: target({ isAll: true }),
  })),
  'what is going can be asked of every timer at once',
);
assert.deepEqual(
  ['timers', 'show the timers', 'open the timers'].map((phrase) =>
    parseWithTimers(phrase),
  ),
  Array.from({ length: 3 }, () => ({ kind: 'SHOW_TIMERS' })),
  'asking for the timers shows them',
);

[
  'stop it',
  'stop that',
  'stop the oven',
  'stop everything',
  'pause for effect',
  'turn off the oven',
  'add salt',
  'add two cups of rice',
  'add 2 minutes to the cooking time',
  'give me a minute',
  'bake for ten minutes',
  '10 minutes',
  'how long for the chicken',
  'set a timer for 10 minutes and 5 minutes',
  'ten minutes',
  'the pasta',
  'the second one',
  'never mind',
].forEach((phrase) =>
  assert.equal(
    parseWithTimers(phrase),
    null,
    `kitchen talk about something that is not a timer is not a command, and a bare answer means nothing while no question waits: "${phrase}"`,
  ),
);
assert.equal(
  parse('pause the pasta'),
  null,
  'a name only counts as a timer when a timer has it',
);

const timerChoice: CookVoiceChoice = {
  kind: 'TIMER',
  timers: timerContext.timers,
};
const asked: CookVoiceContext = { ...timerContext, choice: timerChoice };
const pick = (ids: string[], isAll = false) => ({
  kind: 'TIMER_ANSWER',
  answer: { kind: 'PICK', ids, isAll },
});
assert.deepEqual(
  [
    'pasta',
    'the pasta timer',
    'the rice',
    'eggs',
    'the first one',
    'second',
    'the last one',
    '3',
    'the fifteen minute one',
    'one',
    'number one',
  ].map((phrase) => parse(phrase, asked)),
  [
    pick(['t1']),
    pick(['t1']),
    pick(['t2']),
    pick(['t3']),
    pick(['t1']),
    pick(['t2']),
    pick(['t3']),
    pick(['t3']),
    pick(['t2']),
    pick(['t1']),
    pick(['t1']),
  ],
  'while asked which timer, a name, a place in the list or a length picks it',
);
assert.deepEqual(
  ['both', 'all of them', 'every timer'].map((phrase) => parse(phrase, asked)),
  Array.from({ length: 3 }, () => pick(['t1', 't2', 't3'], true)),
  'all picks every timer that was offered',
);
assert.deepEqual(
  parse('ten minutes', asked),
  pick(['t1', 't3']),
  'a length two timers share picks both, and the screen asks again between them',
);
assert.deepEqual(
  [parse('never mind', asked), parse('banana', asked), parse('next', asked)],
  [
    { kind: 'TIMER_ANSWER', answer: { kind: 'NEVER_MIND' } },
    null,
    { kind: 'NEXT' },
  ],
  'never mind drops the question, anything else is not an answer, and a real command still runs',
);
const askedLength: CookVoiceContext = {
  ...timerContext,
  choice: { kind: 'LENGTH' },
};
assert.deepEqual(
  [
    'ten minutes',
    '10',
    'five',
    'an hour',
    'half an hour',
    '1 hour 30 minutes',
  ].map((phrase) => parse(phrase, askedLength)),
  [600, 600, 300, 3600, 1800, 5400].map((seconds) => ({
    kind: 'TIMER_ANSWER',
    answer: { kind: 'LENGTH', seconds },
  })),
  'while asked how long, a length (a bare number is minutes) answers',
);
assert.equal(
  parse('banana', askedLength),
  null,
  'something that is not a length is not an answer to how long',
);

assert.deepEqual(
  getTimerChoiceNames([
    { name: 'Timer', label: '10 min' },
    { name: 'Timer', label: '5 min' },
    { name: 'Rice', label: '15 min' },
  ]),
  ['Timer (10 min)', 'Timer (5 min)', 'Rice'],
  'two timers with one name are told apart by their length',
);
assert.deepEqual(
  [
    describeTimerQuestion(
      [
        { name: 'Pasta water', label: '10 min' },
        { name: 'Rice', label: '15 min' },
      ],
      'pause',
    ),
    describeTimerQuestion(
      ['A', 'B', 'C', 'D'].map((name) => ({ name, label: '1 min' })),
      'pause',
    ).show,
    describeTimerQuestion(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, label: '1 min' })),
      'extend',
    ).show,
  ],
  [
    {
      show: 'Which timer to pause: Pasta water or Rice?',
      speak: 'Which timer should I pause? Pasta water or Rice?',
    },
    'Which timer to pause: A, B, C, or D?',
    'Which timer to extend: A, B, C, or 3 more?',
  ],
  'the question names up to four timers, then how many more',
);

assert.deepEqual(
  [
    resolve(['running'], { name: 'pasta wter' }),
    resolve(['running'], { name: 'chicken' }),
    resolve(['paused'], { name: 'chicken' }),
  ].map((resolution) => [
    resolution.kind,
    resolution.kind === 'GUESS' ? resolution.timer.id : null,
    resolution.kind === 'ASK' ? (resolution.missed ?? null) : null,
  ]),
  [
    ['GUESS', 'b', null],
    ['ASK', null, 'chicken'],
    ['GUESS', 'c', null],
  ],
  'a name nothing has is matched to a close one (a misspelling, a mishearing) and asked about; with no close one the timers are offered, or the only one is asked about',
);
assert.deepEqual(
  [
    describeTimerGuess('Checkers', 'chicken'),
    describeTimerQuestion([{ name: 'A', label: '1 min' }], 'pause', 'chicken')
      .show,
  ],
  [
    {
      show: 'No chicken timer. Did you mean Checkers?',
      speak: "I don't have a chicken timer. Did you mean Checkers?",
    },
    'No chicken timer. Which timer to pause: A?',
  ],
  'a guess and a miss are said plainly',
);
assert.deepEqual(
  [
    'rename the pasta timer to noodles',
    'rename the ten minute timer to rice',
    'call the pasta timer noodles',
    'name this timer soup',
    'rename it to soup',
    'rename the pasta to noodles',
  ].map((phrase) => parseWithTimers(phrase)),
  [
    {
      kind: 'RENAME_TIMER',
      target: target({ name: 'pasta' }),
      name: 'noodles',
    },
    { kind: 'RENAME_TIMER', target: target({ seconds: 600 }), name: 'rice' },
    {
      kind: 'RENAME_TIMER',
      target: target({ name: 'pasta' }),
      name: 'noodles',
    },
    { kind: 'RENAME_TIMER', target: target({}), name: 'soup' },
    { kind: 'RENAME_TIMER', target: target({}), name: 'soup' },
    {
      kind: 'RENAME_TIMER',
      target: target({ name: 'pasta' }),
      name: 'noodles',
    },
  ],
  'a timer is renamed by saying which one and the new name',
);
assert.equal(
  parseWithTimers('rename the oven to soup'),
  null,
  'renaming something that is not a timer is not a command',
);
assert.deepEqual(
  ['showtime', 'show time', 'show times', 'show timer', 'timer list'].map(
    (phrase) => parseWithTimers(phrase),
  ),
  Array.from({ length: 5 }, () => ({ kind: 'SHOW_TIMERS' })),
  'what a recognizer hears for "show timers" still shows them',
);
const guessed: CookVoiceContext = {
  ...timerContext,
  choice: { kind: 'TIMER', timers: [timerContext.timers[0]], isConfirm: true },
};
assert.deepEqual(
  ['yes', 'yeah', 'that one'].map((phrase) => parse(phrase, guessed)),
  Array.from({ length: 3 }, () => pick(['t1'])),
  'yes confirms the guessed timer',
);
assert.deepEqual(
  [parse('no', guessed), parse('yes', asked)],
  [{ kind: 'TIMER_ANSWER', answer: { kind: 'NEVER_MIND' } }, null],
  'no drops a guess, and yes means nothing when a timer is asked for by name',
);

expectKind(
  [
    'read the tips',
    'read tips',
    'Read me the tips.',
    'repeat the tip',
    'any tips',
    'what are the tips',
    'okay Pepper read the tips please',
  ],
  { kind: 'READ_TIPS' },
  'tips are read when asked for, in the words people use to repeat a thing',
);
expectKind(
  ['read the notes', 'read my notes', 'repeat my note', 'what did I note', 'any notes'],
  { kind: 'READ_NOTES' },
  'notes are read when asked for',
);
assert.deepEqual(
  [parse('tip'), parse('note'), parse('tips for chicken'), parse('add salt')],
  [null, null, null, null],
  'a word the kitchen says on its own is not a command',
);
assert.deepEqual(
  parse(['repeat', 'repeat the tip']),
  { kind: 'REPEAT' },
  'plain repeat still reads the step',
);
assert.deepEqual(
  ['add a tip', 'new tip', 'I have a tip', 'Add a note', 'make a note', 'add a change', 'suggest a change'].map(
    (phrase) => parse(phrase),
  ),
  [
    { kind: 'ADD_ENTRY', entryKind: 'TIP' },
    { kind: 'ADD_ENTRY', entryKind: 'TIP' },
    { kind: 'ADD_ENTRY', entryKind: 'TIP' },
    { kind: 'ADD_ENTRY', entryKind: 'NOTE' },
    { kind: 'ADD_ENTRY', entryKind: 'NOTE' },
    { kind: 'ADD_ENTRY', entryKind: 'CHANGE' },
    { kind: 'ADD_ENTRY', entryKind: 'CHANGE' },
  ],
  'a tip, a note or a change is started by saying so',
);
expectKind(
  ['undo that', 'scratch that', 'delete that note'],
  { kind: 'UNDO_ENTRY' },
  'what was just dictated can be taken back',
);

assert.deepEqual(
  ['constructor', 'toString', 'hasOwnProperty', '__proto__'].map((word) => parse(word)),
  [null, null, null, null],
  'a word that names an object property is not a command',
);

const dictating: CookVoiceContext = {
  ...plate,
  choice: { kind: 'DICTATE', entryKind: 'TIP' },
};
assert.deepEqual(
  parse("Don't crowd the pan or it will steam", dictating),
  { kind: 'DICTATION', text: "Don't crowd the pan or it will steam" },
  'while a tip is being dictated, what is said is the tip',
);
assert.deepEqual(
  parse('keep the pan hot', dictating),
  { kind: 'DICTATION', text: 'Keep the pan hot' },
  'a dictated entry starts with a capital letter',
);
assert.deepEqual(
  parse('next', dictating),
  { kind: 'DICTATION', text: 'Next' },
  'and even a command word is the words, so a tip never moves the step',
);
assert.deepEqual(
  ['never mind', 'cancel', 'forget it'].map((phrase) => parse(phrase, dictating)),
  Array.from({ length: 3 }, () => ({
    kind: 'TIMER_ANSWER',
    answer: { kind: 'NEVER_MIND' },
  })),
  'a way out is still a way out',
);
assert.deepEqual(
  parse('stop listening', dictating),
  { kind: 'STOP_LISTENING' },
  'and so is turning the mic off',
);
assert.equal(parse('   ', dictating), null, 'silence is not a tip');
{
  const long = parse(`${'tender '.repeat(120)}end`, dictating);
  assert.equal(long?.kind, 'DICTATION', 'a long tip is kept, not dropped');
  assert.equal(
    long?.kind === 'DICTATION' && long.text.length <= 400 && !long.text.endsWith(' '),
    true,
    'but cut to the cap at a word',
  );
}
assert.deepEqual(
  parse('read the tips', { ...plate, choice: { kind: 'LENGTH' } }),
  { kind: 'READ_TIPS' },
  'a timer question does not stop tips being read',
);

console.log('pinchVoice: all checks passed');
