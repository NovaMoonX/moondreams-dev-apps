import assert from 'node:assert/strict';

import {
  describeAmounts,
  describeTimersLeft,
  formatSpokenTime,
  normalizeTranscript,
  parseCookCommand,
  readSpokenDuration,
  toSingular,
  toSpokenAmount,
  type CookCommand,
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
  ],
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
    'continue',
    'go on',
    'move on',
    'keep going',
  ],
  { kind: 'NEXT' },
  'every way to say next is next',
);
expectKind(
  ['back', 'go back', 'previous', 'previous step', 'step back', 'Back one.'],
  { kind: 'BACK' },
  'every way to say back is back',
);
expectKind(
  [
    'repeat',
    'repeat that',
    'read it',
    'read the step',
    'say that again',
    'again',
    'come again',
  ],
  { kind: 'REPEAT' },
  'every way to ask again reads the step',
);
expectKind(
  [
    'ingredients',
    'show ingredients',
    'show me the ingredients',
    'what do I need',
  ],
  { kind: 'SHOW_INGREDIENTS' },
  'asking for the ingredients shows them',
);
expectKind(
  ['steps', 'show steps', 'back to the steps', 'instructions'],
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
expectKind(
  [
    'how much time is left',
    'how much time left',
    'how much longer',
    'how long',
    'time left',
    'how long is left on the timer',
    'how much time is left on the ten minute timer',
    "what's left",
  ],
  { kind: 'TIME_LEFT' },
  'asking how long is the time-left question',
);

expectKind(
  ['start the timer', 'start timer', 'Start a timer.', 'start the timer again'],
  { kind: 'START_TIMER', seconds: null },
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
  { kind: 'START_TIMER', seconds: 600 },
  'a length said with the timer picks the timer of that length',
);
expectKind(
  ['start the twenty five minute timer', 'start the twenty-five minute timer'],
  { kind: 'START_TIMER', seconds: 1500 },
  'tens and ones said as words make one number',
);
expectKind(
  ['start the half an hour timer', 'start the thirty minute timer'],
  { kind: 'START_TIMER', seconds: 1800 },
  'half an hour is thirty minutes',
);
expectKind(
  ['start the hour and a half timer', 'start the one and a half hour timer'],
  { kind: 'START_TIMER', seconds: 5400 },
  'an hour and a half is ninety minutes',
);
expectKind(
  ['pause', 'pause the timer', 'pause timer', 'hold the timer'],
  { kind: 'PAUSE_TIMER', seconds: null },
  'pause pauses the timer',
);
expectKind(
  ['resume', 'resume the timer', 'unpause', 'continue the timer'],
  { kind: 'RESUME_TIMER', seconds: null },
  'resume resumes the timer',
);
expectKind(
  [
    'stop',
    'dismiss',
    'silence',
    'quiet',
    'stop the alarm',
    'silence the alarm',
  ],
  { kind: 'STOP_TIMER', seconds: null, scope: 'RINGING' },
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
  { kind: 'STOP_TIMER', seconds: null, scope: 'ANY' },
  'stop the timer stops one that is going',
);
assert.deepEqual(
  parse('stop the 10 minute timer'),
  { kind: 'STOP_TIMER', seconds: 600, scope: 'ANY' },
  'a length picks which timer to stop',
);
assert.deepEqual(
  parse('pause the twenty minute timer'),
  { kind: 'PAUSE_TIMER', seconds: 1200 },
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
  ['next recipe', 'next dish', 'the other dish', 'switch recipe'],
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

assert.deepEqual(
  parse(['necks', 'next']),
  { kind: 'NEXT' },
  "the recognizer's second guess is tried when the first is not a command",
);
assert.deepEqual(
  parse(['next door', 'the next batch']),
  null,
  'no guess that is a command means no command',
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
  ],
  [
    '12 minutes',
    '1 minute 30 seconds',
    '45 seconds',
    '1 hour 5 minutes',
    '0 seconds',
    '1 minute',
  ],
  'a time left is said in round words, with seconds only under two minutes',
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
    show: '12:30 left · 30 min timer',
    speak: '13 minutes left on the 30 minute timer.',
  },
  'one timer is named by its length, said in whole words',
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
    show: 'Marinate: 1:30, paused · Rice · Simmer: done',
    speak: 'Marinate: 1 minute 30 seconds left, paused. Rice · Simmer is done.',
  },
  'several timers are each named, with paused and done said',
);
assert.deepEqual(
  describeAmounts([
    { name: 'Garlic', amountText: '6' },
    { name: 'Soy sauce', amountText: '¼ cup' },
  ]),
  {
    show: 'Garlic · 6, Soy sauce · ¼ cup',
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
    show: 'Garlic · 4 and ½ tsp',
    speak: 'Garlic, 4 and a half teaspoon.',
  },
  'a name on two lines is said once with both amounts',
);

console.log('pinchVoice: all checks passed');
