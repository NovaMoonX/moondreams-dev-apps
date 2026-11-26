import assert from 'node:assert/strict';

import { readPepperBody } from '../../functions/src/apps/pinch/pepper/pepperTurn.ts';
import {
  buildPepperScreen,
  buildPepperStanding,
  PEPPER_BODY_LIMITS,
  type PepperRecipeInput,
  type PepperScreenInput,
} from '../../src/apps/pinch/utils/pepperContext.ts';

const recipe = (
  title: string,
  lineCount: number,
  stepCount: number,
  stepChars: number,
): PepperRecipeInput => ({
  title,
  servings: 4,
  lines: Array.from({ length: lineCount }, (_, at) => ({
    name: `ingredient ${at}`,
    amountText: `${at + 1} cups`,
    note: at % 3 === 0 ? 'finely chopped' : null,
    group: at % 2 === 0 ? 'For the sauce' : null,
  })),
  steps: Array.from(
    { length: stepCount },
    (_, at) => `Step ${at} ${'stir and wait '.repeat(stepChars / 13)}`,
  ),
  sections: Array.from({ length: stepCount }, (_, at) =>
    at < stepCount / 2 ? 'Make the base' : 'Finish it',
  ),
  keeping: 'Leftovers keep 3 days in the fridge',
});

const send = (standing: string, screen: string) =>
  readPepperBody({
    standing,
    screen,
    heard: 'how much butter',
    alternatives: ['how much better', 'how much butter please'],
    history: [],
  });

// A normal recipe reads in full and in order.
const small = buildPepperStanding([recipe('Adobo chicken', 8, 6, 120)]);
assert.ok(
  small.includes('Recipe: Adobo chicken (makes 4 servings as written)'),
);
assert.ok(small.indexOf('Ingredients:') < small.indexOf('Steps:'));
assert.ok(small.includes('For the sauce:'));
assert.ok(small.includes('1. Step 0'));
assert.ok(small.includes('Make the base:'));
assert.ok(small.includes('Keeping it: Leftovers keep'));
assert.ok(small.length < PEPPER_BODY_LIMITS.standing);

// Ungrouped lines come before the first heading.
const grouped = buildPepperStanding([recipe('A', 4, 1, 26)]);
assert.ok(grouped.indexOf('ingredient 1') < grouped.indexOf('For the sauce:'));

// A big recipe and a big plate stay under the cap and pass the server's reader.
const big = buildPepperStanding([recipe('Big feast', 60, 80, 900)]);
assert.ok(big.length <= PEPPER_BODY_LIMITS.standing, String(big.length));
const plate = buildPepperStanding([
  recipe('One', 80, 100, 1500),
  recipe('Two', 80, 100, 1500),
  recipe('Three', 80, 100, 1500),
]);
assert.ok(plate.length <= PEPPER_BODY_LIMITS.standing, String(plate.length));
assert.ok(plate.includes('Recipe: One') && plate.includes('Recipe: Three'));
assert.ok(send(plate, '') !== null);
assert.ok(send(big, '') !== null);

// A recipe with room keeps its long steps whole.
assert.ok(
  buildPepperStanding([recipe('Long', 5, 5, 400)]).includes(
    'stir and wait '.repeat(20).trim(),
  ),
);

const base: PepperScreenInput = {
  isAddOffered: false,
  view: 'steps',
  recipeTitle: 'Adobo chicken',
  step: { number: 2, count: 6, text: 'Brown the chicken.', section: 'Cook' },
  servings: [{ title: 'Adobo chicken', servings: 6 }],
  timers: [
    { name: 'Rice', status: 'running', leftMs: 125_000 },
    { name: 'Pasta water', status: 'done', leftMs: 0 },
  ],
  stepLines: [
    { name: 'chicken thigh', amountText: '3 lb', isAdded: false },
    { name: 'soy sauce', amountText: '2 tbsp', isAdded: true },
  ],
  gather: null,
  entries: [
    {
      id: 'n-here',
      kind: 'tip',
      text: 'Do not crowd the pan',
      reason: null,
      step: 2,
    },
    {
      id: 'n-other',
      kind: 'change',
      text: 'Use less salt',
      reason: 'Too salty',
      step: null,
    },
  ],
};
const screen = buildPepperScreen(base);
assert.ok(screen.startsWith('Showing: the steps.'));
assert.ok(screen.includes('Step 2 of 6 (Cook): Brown the chicken.'));
assert.ok(screen.includes('- Adobo chicken: 6'));
assert.ok(screen.includes('- Rice: 2:05 left, running'));
assert.ok(screen.includes('- Pasta water: rang, waiting to be dismissed'));
assert.ok(screen.includes('- 3 lb chicken thigh'));
assert.ok(screen.includes('- 2 tbsp soy sauce (added)'));
assert.ok(!screen.includes('already offered'));
assert.ok(
  buildPepperScreen({ ...base, isAddOffered: true }).includes(
    'already offered',
  ),
);
assert.ok(!screen.includes('chicken thigh (added)'));
assert.ok(screen.includes('id n-here, tip, step 2: Do not crowd the pan'));
assert.ok(
  screen.includes(
    'id n-other, change, whole recipe: Use less salt (because Too salty)',
  ),
);
// The step's own entry is listed before the recipe's.
assert.ok(screen.indexOf('n-here') < screen.indexOf('n-other'));

// The gather screen lists what is left first, then what is ticked.
const gather = buildPepperScreen({
  ...base,
  view: 'gather',
  step: null,
  stepLines: [],
  gather: [
    {
      dish: null,
      lines: [
        { name: 'butter', amountText: '2 tbsp', isOut: true },
        { name: 'garlic', amountText: '3 cloves', isOut: false },
      ],
    },
  ],
});
assert.ok(gather.includes('Still to get out:\n- 3 cloves garlic'));
assert.ok(
  gather.indexOf('Still to get out') < gather.indexOf('Already got out'),
);
assert.ok(!gather.includes('Step 2'));

// A crowded screen keeps what is on screen first and every entry it lists whole, with its id.
const crowded = buildPepperScreen({
  ...base,
  step: { ...base.step!, text: 'Whisk. '.repeat(400) },
  stepLines: Array.from({ length: 300 }, (_, at) => ({
    name: `thing ${at}`,
    amountText: '1 cup',
    isAdded: false,
  })),
  timers: Array.from({ length: 10 }, (_, at) => ({
    name: `Timer ${at}`,
    status: 'running' as const,
    leftMs: 60_000,
  })),
  entries: Array.from({ length: 200 }, (_, at) => ({
    id: `entry-${at}`,
    kind: 'note' as const,
    text: 'word '.repeat(100),
    reason: null,
    step: at % 7 === 0 ? 2 : null,
  })),
});
assert.ok(crowded.length <= PEPPER_BODY_LIMITS.screen, String(crowded.length));
assert.ok(crowded.startsWith('Showing: the steps.'));
assert.ok(crowded.includes('Servings being made:'));
assert.ok(crowded.includes('- Timer 0: 1:00 left, running'));
assert.ok(crowded.includes('id entry-0, note, step 2'));
assert.ok(
  crowded
    .split('\n')
    .filter((line) => line.startsWith('- id '))
    .every((line) =>
      /^- id entry-\d+, note, (step 2|whole recipe): /.test(line),
    ),
);
assert.ok(send(small, crowded) !== null);
assert.ok(send(small, screen) !== null);

// An empty screen is allowed by the server and a very long one is not.
assert.equal(send(small, 'x'.repeat(PEPPER_BODY_LIMITS.screen + 1)), null);
assert.equal(send('x'.repeat(PEPPER_BODY_LIMITS.standing + 1), ''), null);

console.log('Pepper context: ok');
