import assert from 'node:assert/strict';

import {
  addGroup,
  addStep,
  canMoveStep,
  fromProcedure,
  isGroupsFull,
  isStepsFull,
  moveStep,
  orderedSteps,
  removeGroup,
  setStepGroup,
  summarizeEdit,
  toContent,
  toStoredParts,
  type ProcedureDraft,
} from '../../src/apps/helm/utils/procedureDraft.ts';
import { toProcedureMarkdown } from '../../src/apps/helm/utils/procedureMarkdown.ts';
import {
  countSteps,
  flattenSteps,
  groupSteps,
  toStepState,
} from '../../src/apps/helm/utils/stepGroups.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const source = {
  title: 'Packing',
  stepState: {
    z: { order: 0, groupId: null },
    b: { order: 1, groupId: 'clothes' },
    a: { order: 1, groupId: 'clothes' },
    c: { order: 0, groupId: 'clothes' },
    lost: { order: 2, groupId: 'deleted-group' },
    nogroup: { order: 3, groupId: null },
    d: { order: 0, groupId: 'tech' },
    nowords: { order: 9, groupId: null },
  },
  groupOrder: ['clothes', 'tech', 'clothes', 'ghost'],
  steps: {
    z: { text: 'Weather', detail: null },
    a: { text: 'Shirts', detail: 'Two, ironed' },
    b: { text: 'Trousers', detail: null },
    c: { text: 'Shoes', detail: null },
    d: { text: 'Laptop', detail: null },
    lost: { text: 'Orphan', detail: null },
    nogroup: { text: 'Tickets', detail: null },
  },
  groups: { clothes: { name: 'Clothes' }, tech: { name: 'Tech' } },
};

const idsOf = (blocks: ReturnType<typeof groupSteps>) =>
  blocks.map((block) => [block.groupId, block.steps.map((step) => step.id)]);

test('groupSteps puts ungrouped first, then each group, ties broken by id', () => {
  assert.deepEqual(idsOf(groupSteps(source)), [
    [null, ['z', 'lost', 'nogroup']],
    ['clothes', ['c', 'a', 'b']],
    ['tech', ['d']],
  ]);
});

test('groupSteps skips a step with no words and a group with no entry, and keeps empty groups on request', () => {
  const blocks = groupSteps(source);
  assert.equal(countSteps(blocks), 7);
  assert.equal(
    blocks.some((block) => block.groupId === 'ghost'),
    false,
  );
  const withEmpty = groupSteps(
    {
      ...source,
      groupOrder: [...source.groupOrder, 'empty'],
      groups: { ...source.groups, empty: { name: 'Empty' } },
    },
    { keepEmpty: true },
  );
  assert.equal(withEmpty.at(-1)?.groupId, 'empty');
});

test('toStepState renumbers from zero in the order given', () => {
  const flat = flattenSteps(groupSteps(source));
  const state = toStepState(flat);
  assert.deepEqual(
    Object.values(state).map((place) => place.order),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.equal(state.c.groupId, 'clothes');
  assert.equal(state.lost.groupId, null);
});

const draft = (): ProcedureDraft => ({
  title: 'T',
  groups: [{ id: 'g', name: 'Group' }],
  steps: [
    { id: 'a', text: 'A', detail: null, groupId: null },
    { id: 'b', text: 'B', detail: null, groupId: 'g' },
    { id: 'c', text: 'C', detail: null, groupId: null },
    { id: 'd', text: 'D', detail: null, groupId: 'g' },
  ],
});

const readIds = (d: ProcedureDraft) => orderedSteps(d).map((step) => step.id);

test('reading order is ungrouped first, then each group', () => {
  assert.deepEqual(readIds(draft()), ['a', 'c', 'b', 'd']);
});

test('moving a step swaps it with its neighbour inside its own group only', () => {
  assert.deepEqual(readIds(moveStep(draft(), 'c', 'up')), ['c', 'a', 'b', 'd']);
  assert.deepEqual(readIds(moveStep(draft(), 'b', 'down')), [
    'a',
    'c',
    'd',
    'b',
  ]);
  assert.equal(canMoveStep(draft(), 'a', 'up'), false);
  assert.equal(canMoveStep(draft(), 'c', 'down'), false);
  assert.equal(canMoveStep(draft(), 'd', 'down'), false);
  assert.equal(moveStep(draft(), 'a', 'up').steps.length, 4);
});

test('a step put in another group goes to the end of it, and a removed group frees its steps', () => {
  assert.deepEqual(readIds(setStepGroup(draft(), 'a', 'g')), [
    'c',
    'b',
    'd',
    'a',
  ]);
  const freed = removeGroup(draft(), 'g');
  assert.deepEqual(readIds(freed), ['a', 'b', 'c', 'd']);
  assert.equal(freed.groups.length, 0);
});

test('the 61st step and the 13th group are refused', () => {
  const sixty = Array.from({ length: 60 }, (_, index) => ({
    id: `s${index}`,
    text: `Step ${index}`,
    detail: null,
    groupId: null,
  }));
  const full = { title: 'T', groups: [], steps: sixty };
  assert.equal(isStepsFull(full), true);
  assert.equal(addStep(full, 'extra', null), full);
  assert.equal(isStepsFull({ ...full, steps: sixty.slice(1) }), false);
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `g${index}`,
    name: `G${index}`,
  }));
  const groups = { title: 'T', groups: twelve, steps: [] };
  assert.equal(isGroupsFull(groups), true);
  assert.equal(addGroup(groups, 'extra', 'X'), groups);
});

test('saving cuts a task made into a procedure at 60 steps and caps every word', () => {
  const steps = Array.from({ length: 75 }, (_, index) => ({
    id: `s${index}`,
    text: `Step ${index}`.padEnd(260, 'x'),
    detail: index === 0 ? 'd'.repeat(600) : null,
    groupId: null,
  }));
  const content = toContent({ title: 'T'.repeat(120), groups: [], steps });
  assert.equal(content.steps.length, 60);
  assert.equal(content.steps[0].text.length, 200);
  assert.equal(content.steps[0].detail?.length, 500);
  assert.equal(content.title.length, 80);
  assert.equal(content.steps.at(-1)?.id, 's59');
});

test('saving drops empty steps and groups with none, and keeps the rest in reading order', () => {
  const messy: ProcedureDraft = {
    title: '  Packing  ',
    groups: [
      { id: 'g', name: 'Group' },
      { id: 'empty', name: 'Empty' },
    ],
    steps: [
      { id: 'a', text: '  ', detail: null, groupId: null },
      { id: 'b', text: ' B ', detail: '  ', groupId: 'g' },
      { id: 'c', text: 'C', detail: null, groupId: null },
    ],
  };
  const content = toContent(messy);
  assert.equal(content.title, 'Packing');
  assert.deepEqual(
    content.steps.map((step) => [step.id, step.text, step.detail]),
    [
      ['c', 'C', null],
      ['b', 'B', null],
    ],
  );
  assert.deepEqual(content.groups, [{ id: 'g', name: 'Group' }]);
  const parts = toStoredParts(content);
  assert.deepEqual(parts.groupOrder, ['g']);
  assert.deepEqual(parts.stepState, {
    c: { order: 0, groupId: null },
    b: { order: 1, groupId: 'g' },
  });
});

test('a procedure round-trips through the draft', () => {
  const content = toContent(fromProcedure(source));
  const parts = toStoredParts(content);
  assert.deepEqual(
    idsOf(groupSteps({ ...parts.body, ...parts })),
    idsOf(groupSteps(source)).filter(([, ids]) => (ids as string[]).length > 0),
  );
});

test('the edit summary says what changed', () => {
  const before = draft();
  assert.equal(summarizeEdit(before, before), 'You saved it again');
  assert.equal(
    summarizeEdit(before, addStep(before, 'e', null)),
    'You added 1 step',
  );
  assert.equal(
    summarizeEdit(before, { ...before, title: 'U' }),
    'You changed the title',
  );
  assert.equal(
    summarizeEdit(before, moveStep(before, 'c', 'up')),
    'You reordered the steps',
  );
});

test('Markdown is a checklist with groups, details indented and user text escaped', () => {
  const markdown = toProcedureMarkdown({
    title: 'Pack *light* [now]',
    stepState: {
      a: { order: 0, groupId: null },
      b: { order: 0, groupId: 'g' },
      c: { order: 1, groupId: 'g' },
    },
    groupOrder: ['g'],
    steps: {
      a: { text: '- first_step', detail: null },
      b: { text: '# Shirts', detail: 'Two, ironed\nand folded' },
      c: { text: 'Socks', detail: null },
    },
    groups: { g: { name: 'Clothes' } },
  });
  assert.equal(
    markdown,
    [
      '# Pack \\*light\\* \\[now\\]',
      '',
      '- [ ] \\- first\\_step',
      '',
      '## Clothes',
      '- [ ] \\# Shirts',
      '  Two, ironed',
      '  and folded',
      '- [ ] Socks',
    ].join('\n'),
  );
});

test('Markdown with no ungrouped steps starts at the first group', () => {
  const markdown = toProcedureMarkdown({
    title: 'T',
    stepState: { a: { order: 0, groupId: 'g' } },
    groupOrder: ['g'],
    steps: { a: { text: 'A', detail: null } },
    groups: { g: { name: 'G' } },
  });
  assert.equal(markdown, '# T\n\n## G\n- [ ] A');
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
