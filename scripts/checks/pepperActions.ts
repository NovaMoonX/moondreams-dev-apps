import assert from 'node:assert/strict';

import { PEPPER_TOOLS } from '../../functions/src/apps/pinch/pepper/pepperPrompt.ts';
import {
  askToRemoveEntry,
  createRemovalWait,
  readConfirmAnswer,
  readPepperAction,
} from '../../src/apps/pinch/utils/pepperActions.ts';
import { NO_TIMER_TARGET } from '../../src/apps/pinch/utils/cookVoice.ts';
import { readAddressedGuesses } from '../../src/apps/pinch/utils/cookVoiceMode.ts';

const read = (name: string, input: unknown) =>
  readPepperAction({ name, input });
const isInvalid = (name: string, input: unknown) =>
  read(name, input).kind === 'invalid';

// Every tool the model is given maps to a command, so none is silently dropped.
const valid: Record<string, unknown> = {
  go_to_step: { step: 2 },
  timer: { action: 'pause', seconds: null, name: null },
  set_servings: { servings: 6 },
  show: { what: 'tips' },
  tick_ingredients: { names: ['butter'], got: true },
  add_entry: { kind: 'tip', text: "Don't crowd the pan", step: null },
  edit_entry: { id: 'n1', text: 'Use less salt' },
  remove_entry: { id: 'n1' },
  add_to_shopping_list: { items: [{ name: 'milk', amount: null }] },
  undo_last: {},
};
assert.deepEqual(
  Object.keys(valid).sort(),
  PEPPER_TOOLS.map((tool) => tool.name).sort(),
);
PEPPER_TOOLS.forEach((tool) =>
  assert.notEqual(read(tool.name, valid[tool.name]).kind, 'unknown', tool.name),
);

assert.deepEqual(read('go_to_step', { step: 3 }), {
  kind: 'go_to_step',
  step: 3,
});
assert.deepEqual(read('go_to_step', { step: 2.6 }), {
  kind: 'go_to_step',
  step: 3,
});
[
  { step: 0 },
  { step: -1 },
  { step: '3' },
  { step: null },
  {},
  null,
  'x',
].forEach((input) =>
  assert.ok(isInvalid('go_to_step', input), JSON.stringify(input)),
);

// Timers map onto the cook commands a voice phrase makes.
assert.deepEqual(
  read('timer', { action: 'start', seconds: 600, name: 'pasta' }),
  {
    kind: 'cook',
    command: { kind: 'START_TIMER', seconds: 600, name: 'pasta' },
  },
);
assert.deepEqual(
  read('timer', { action: 'start', seconds: null, name: null }),
  {
    kind: 'cook',
    command: { kind: 'START_TIMER', seconds: null, name: null },
  },
);
assert.ok(
  isInvalid('timer', { action: 'start', seconds: null, name: 'pasta' }),
);
assert.ok(isInvalid('timer', { action: 'start', seconds: 0, name: null }));
assert.ok(isInvalid('timer', { action: 'start', seconds: 90_000, name: null }));
assert.ok(
  isInvalid('timer', { action: 'start', seconds: Infinity, name: null }),
);
assert.ok(
  isInvalid('timer', { action: 'add_time', seconds: null, name: null }),
);
assert.deepEqual(
  read('timer', { action: 'pause', seconds: null, name: ' Rice ' }),
  {
    kind: 'cook',
    command: {
      kind: 'PAUSE_TIMER',
      target: { seconds: null, name: 'Rice', isAll: false },
    },
  },
);
assert.deepEqual(
  read('timer', { action: 'resume', seconds: null, name: null }),
  {
    kind: 'cook',
    command: { kind: 'RESUME_TIMER', target: NO_TIMER_TARGET },
  },
);
assert.deepEqual(read('timer', { action: 'stop', seconds: 5, name: '' }), {
  kind: 'cook',
  command: { kind: 'STOP_TIMER', target: NO_TIMER_TARGET, scope: 'ANY' },
});
assert.deepEqual(
  read('timer', { action: 'add_time', seconds: 120, name: null }),
  {
    kind: 'cook',
    command: { kind: 'EXTEND_TIMER', seconds: 120, target: NO_TIMER_TARGET },
  },
);
assert.equal(
  read('timer', { action: 'explode', seconds: 1, name: null }).kind,
  'unknown',
);

// Servings stay inside what the stepper allows.
assert.deepEqual(read('set_servings', { servings: 6 }), {
  kind: 'cook',
  command: { kind: 'SET_SERVINGS', change: { kind: 'TO', servings: 6 } },
});
assert.deepEqual(read('set_servings', { servings: 2.456 }), {
  kind: 'cook',
  command: { kind: 'SET_SERVINGS', change: { kind: 'TO', servings: 2.46 } },
});
[0, -2, 0.1, 5000, NaN, '4', null].forEach((servings) =>
  assert.ok(isInvalid('set_servings', { servings }), String(servings)),
);

// Lists and views.
const shows: [string, string][] = [
  ['ingredients', 'SHOW_INGREDIENTS'],
  ['steps', 'SHOW_STEPS'],
  ['timers', 'SHOW_TIMERS'],
  ['notes', 'SHOW_ENTRIES'],
  ['tips', 'SHOW_ENTRIES'],
  ['changes', 'SHOW_ENTRIES'],
];
shows.forEach(([what, kind]) => {
  const command = read('show', { what });
  assert.equal(command.kind === 'cook' && command.command.kind, kind);
});
assert.deepEqual(read('show', { what: 'tips' }), {
  kind: 'cook',
  command: { kind: 'SHOW_ENTRIES', entryKind: 'TIP' },
});
assert.ok(isInvalid('show', { what: 'finish' }));
assert.ok(isInvalid('show', { what: 'constructor' }));

// Ticks.
assert.deepEqual(
  read('tick_ingredients', { names: [' butter ', '', 'garlic'], got: false }),
  {
    kind: 'cook',
    command: {
      kind: 'GOT_INGREDIENT',
      queries: ['butter', 'garlic'],
      isOut: false,
    },
  },
);
assert.ok(isInvalid('tick_ingredients', { names: [], got: true }));
assert.ok(isInvalid('tick_ingredients', { names: ['  '], got: true }));
assert.ok(isInvalid('tick_ingredients', { names: ['butter'], got: 'yes' }));
assert.ok(isInvalid('tick_ingredients', { names: 'butter', got: true }));
const manyNames = read('tick_ingredients', {
  names: Array.from({ length: 40 }, (_, at) => `item ${at}`),
  got: true,
});
assert.equal(
  manyNames.kind === 'cook' &&
    manyNames.command.kind === 'GOT_INGREDIENT' &&
    manyNames.command.queries.length,
  20,
);

// Entries.
assert.deepEqual(
  read('add_entry', { kind: 'change', text: ' Use  less salt ', step: 2 }),
  {
    kind: 'add_entry',
    entryKind: 'CHANGE',
    text: 'Use less salt',
    step: 2,
  },
);
assert.deepEqual(
  read('add_entry', { kind: 'note', text: 'Great', step: null }),
  {
    kind: 'add_entry',
    entryKind: 'NOTE',
    text: 'Great',
    step: null,
  },
);
assert.ok(isInvalid('add_entry', { kind: 'tweak', text: 'x', step: null }));
assert.ok(isInvalid('add_entry', { kind: 'tip', text: '   ', step: null }));
assert.ok(isInvalid('add_entry', { kind: 'tip', text: 'x', step: 0 }));
assert.ok(isInvalid('add_entry', { kind: 'tip', text: 'x', step: 'two' }));
const longText = read('add_entry', {
  kind: 'tip',
  text: `${'word '.repeat(200)}`,
  step: null,
});
assert.ok(
  longText.kind === 'add_entry' &&
    longText.text.length <= 400 &&
    !longText.text.endsWith(' '),
);
assert.deepEqual(read('edit_entry', { id: 'n1', text: 'New words' }), {
  kind: 'edit_entry',
  id: 'n1',
  text: 'New words',
});
assert.ok(isInvalid('edit_entry', { id: '', text: 'x' }));
assert.ok(isInvalid('edit_entry', { id: 'n1', text: ' ' }));
assert.ok(isInvalid('edit_entry', { id: 5, text: 'x' }));
assert.deepEqual(read('remove_entry', { id: 'n1' }), {
  kind: 'remove_entry',
  id: 'n1',
});
assert.ok(isInvalid('remove_entry', {}));
assert.ok(isInvalid('remove_entry', { id: 'x'.repeat(500) }));
assert.equal(
  askToRemoveEntry('TIP', "Don't crowd the pan"),
  "Remove the tip “Don't crowd the pan”?",
);
assert.equal(
  askToRemoveEntry(
    'CHANGE',
    'Use a lot less salt and a lot more pepper than before',
  ),
  'Remove the change “Use a lot less salt and a lot more”?',
);

// Shopping.
assert.deepEqual(
  read('add_to_shopping_list', {
    items: [
      { name: ' Milk ', amount: '2 gallons' },
      { name: '', amount: null },
      { name: 'Eggs', amount: '  ' },
      'junk',
    ],
  }),
  {
    kind: 'add_to_shopping_list',
    items: [
      { name: 'Milk', amount: '2 gallons' },
      { name: 'Eggs', amount: null },
    ],
  },
);
assert.ok(isInvalid('add_to_shopping_list', { items: [] }));
assert.ok(
  isInvalid('add_to_shopping_list', { items: [{ name: '', amount: null }] }),
);
assert.ok(isInvalid('add_to_shopping_list', {}));
const manyItems = read('add_to_shopping_list', {
  items: Array.from({ length: 30 }, (_, at) => ({
    name: `item ${at}`,
    amount: null,
  })),
});
assert.equal(
  manyItems.kind === 'add_to_shopping_list' && manyItems.items.length,
  20,
);

// Undo, and the things nothing here ever does.
assert.deepEqual(read('undo_last', {}), { kind: 'undo_last' });
assert.deepEqual(read('undo_last', undefined), { kind: 'undo_last' });
['finish', 'finish_cooking', 'mark_cooked'].forEach((name) =>
  assert.deepEqual(read(name, {}), { kind: 'finish' }),
);
assert.deepEqual(read('delete_recipe', { id: 'r1' }), { kind: 'unknown' });
assert.deepEqual(read('', null), { kind: 'unknown' });
assert.deepEqual(read('__proto__', {}), { kind: 'unknown' });

// The answer to a removal question.
['yes', 'yeah', 'yep', 'sure', 'okay'].forEach((heard) =>
  assert.equal(readConfirmAnswer(heard), 'yes', heard),
);
['no', 'nope', 'never mind', 'skip'].forEach((heard) =>
  assert.equal(readConfirmAnswer(heard), 'no', heard),
);
['', 'start a timer for ten minutes', 'yes and add salt'].forEach((heard) =>
  assert.equal(readConfirmAnswer(heard), null, heard),
);

// A removal waits for its own yes: a new question clears it, an answer takes it once, and it runs out.
const waiting = createRemovalWait();
waiting.ask('n1', 0);
assert.ok(waiting.isWaiting(1000), 'a removal waits for its yes');
waiting.clear();
assert.ok(!waiting.isWaiting(2000), 'a new question drops the waiting removal');
assert.equal(waiting.take(2000), null, 'so a later yes removes nothing');
waiting.ask('n1', 0);
assert.equal(
  waiting.take(1000),
  'n1',
  'the yes takes the entry it asked about',
);
assert.equal(waiting.take(1500), null, 'and only once');
waiting.ask('n2', 0);
assert.equal(
  waiting.take(61_000),
  null,
  'a yes a minute later removes nothing',
);

// Only the best guess can say yes: a lower-ranked one never confirms.
const top = (phase: 'WINDOW' | 'WAITING', alternatives: string[]) =>
  readAddressedGuesses(phase, alternatives)[0];
assert.equal(readConfirmAnswer(top('WINDOW', ['yes', 'guess']) ?? ''), 'yes');
assert.equal(readConfirmAnswer(top('WINDOW', ['one sec', 'yes']) ?? ''), null);
assert.equal(
  readConfirmAnswer(top('WAITING', ['hey pepper yes', 'hey pepper no']) ?? ''),
  'yes',
);
assert.equal(
  readConfirmAnswer(top('WAITING', ['hey pepper hmm', 'hey pepper yes']) ?? ''),
  null,
);

console.log('Pepper actions: ok');
