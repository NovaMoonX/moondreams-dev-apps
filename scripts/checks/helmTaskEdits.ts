import assert from 'node:assert/strict';

import type { TaskSealed } from '../../src/apps/helm/types.ts';
import {
  applyWordsChange,
  getOrderedSteps,
  getSwapOrders,
  newStepId,
  nextStepOrder,
} from '../../src/apps/helm/utils/taskEdits.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const reread: TaskSealed = {
  title: 'A',
  notes: 'N2',
  steps: { x: { text: 'First' } },
  privateMark: null,
  isPrivacyCleared: false,
};

test('a title change keeps the notes and steps another device changed', () => {
  assert.deepEqual(applyWordsChange(reread, { kind: 'title', title: 'B' }), {
    title: 'B',
    notes: 'N2',
    steps: { x: { text: 'First' } },
    privateMark: null,
    isPrivacyCleared: false,
  });
});

test('a notes change keeps the steps another device added', () => {
  const result = applyWordsChange(reread, { kind: 'notes', notes: null });
  assert.equal(result.notes, null);
  assert.deepEqual(result.steps, reread.steps);
  assert.equal(result.title, 'A');
});

test('adding a step keeps the others, and the next order is max plus one', () => {
  const result = applyWordsChange(reread, {
    kind: 'addStep',
    stepId: 'y',
    text: 'Second',
  });
  assert.deepEqual(Object.keys(result.steps).sort(), ['x', 'y']);
  assert.equal(
    nextStepOrder({
      x: { order: 0, doneAt: null },
      y: { order: 4, doneAt: null },
    }),
    5,
  );
  assert.equal(nextStepOrder({}), 0);
});

test('removing a step drops only its key', () => {
  const both = {
    ...reread,
    steps: { x: { text: 'First' }, y: { text: 'Second' } },
  };
  const result = applyWordsChange(both, { kind: 'removeStep', stepId: 'x' });
  assert.deepEqual(result.steps, { y: { text: 'Second' } });
  assert.equal(result.notes, 'N2');
});

test('editing a step changes only its text', () => {
  const result = applyWordsChange(reread, {
    kind: 'editStep',
    stepId: 'x',
    text: 'Changed',
  });
  assert.deepEqual(result, { ...reread, steps: { x: { text: 'Changed' } } });
});

test('steps are ordered by order then id and skip ids missing a side', () => {
  const steps = getOrderedSteps({
    steps: {
      a: { text: 'A' },
      b: { text: 'B' },
      c: { text: 'C' },
      onlyWords: { text: 'W' },
    },
    stepState: {
      a: { order: 1, doneAt: null },
      b: { order: 0, doneAt: 5 },
      c: { order: 1, doneAt: null },
      onlyState: { order: 2, doneAt: null },
    },
  });
  assert.deepEqual(
    steps.map((step) => step.id),
    ['b', 'a', 'c'],
  );
  assert.equal(steps[0].doneAt, 5);
});

test('a step state with no order is ignored by the next order and the ordering', () => {
  const stepState = {
    a: { order: 2, doneAt: null },
    b: { doneAt: null },
  } as unknown as Parameters<typeof nextStepOrder>[0];
  assert.equal(nextStepOrder(stepState), 3);
  const steps = getOrderedSteps({
    steps: { a: { text: 'A' }, b: { text: 'B' } },
    stepState,
  });
  assert.deepEqual(
    steps.map((step) => step.id),
    ['a'],
  );
});

test('editing a step another device removed leaves the words as they are', () => {
  const result = applyWordsChange(reread, {
    kind: 'editStep',
    stepId: 'gone',
    text: 'Back again',
  });
  assert.equal(result, reread);
});

test('a swap trades two orders and is null at the ends', () => {
  const steps = getOrderedSteps({
    steps: { a: { text: 'A' }, b: { text: 'B' } },
    stepState: {
      a: { order: 0, doneAt: null },
      b: { order: 1, doneAt: null },
    },
  });
  assert.deepEqual(getSwapOrders(steps, 'a', 'down'), { a: 1, b: 0 });
  assert.equal(getSwapOrders(steps, 'a', 'up'), null);
  assert.equal(getSwapOrders(steps, 'b', 'down'), null);
});

test('a step id is twelve lowercase letters or digits', () => {
  assert.match(newStepId(), /^[a-z0-9]{12}$/);
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
