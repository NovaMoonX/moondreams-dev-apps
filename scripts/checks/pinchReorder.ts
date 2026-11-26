import assert from 'node:assert/strict';

import {
  canMoveIngredientGroup,
  canMoveStepSection,
  getLineNeighbourSlot,
  getSpanAnchor,
  getStepNeighbourSlot,
  moveIngredientGroup,
  moveIngredientLine,
  moveStep,
  moveStepSection,
  restoreSpanOrder,
} from '../../src/apps/pinch/utils/recipeReorder.ts';

const list = {
  steps: ['a', 'b', 'c', 'd', 'e'],
  sections: [null, 'Sauce', 'Sauce', 'Chicken', 'Chicken'],
};

{
  const moved = moveStep(list, 1, { group: 2, index: 1 });
  assert.deepEqual(moved.steps, ['a', 'c', 'd', 'b', 'e']);
  assert.deepEqual(moved.sections, [
    null,
    'Sauce',
    'Chicken',
    'Chicken',
    'Chicken',
  ]);
  assert.equal(
    moved.index,
    3,
    'a step dropped in another section takes its name',
  );
}
{
  const moved = moveStep(list, 0, { group: 1, index: 0 });
  assert.deepEqual(moved.steps, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(moved.sections, [
    'Sauce',
    'Sauce',
    'Sauce',
    'Chicken',
    'Chicken',
  ]);
  assert.equal(moved.index, 0, 'the emptied run disappears');
}
{
  const moved = moveStepSection(list, 2, 1);
  assert.deepEqual(moved.steps, ['a', 'd', 'e', 'b', 'c']);
  assert.deepEqual(moved.sections, [
    null,
    'Chicken',
    'Chicken',
    'Sauce',
    'Sauce',
  ]);
  const pinned = moveStepSection(list, 2, 0);
  assert.deepEqual(
    pinned.steps,
    moved.steps,
    'the leading unnamed run stays first',
  );
  assert.deepEqual(
    moveStepSection(list, 0, 2),
    list,
    'the leading unnamed run never moves',
  );
}
{
  assert.deepEqual(getStepNeighbourSlot(list, 1, -1), { group: 0, index: 1 });
  assert.deepEqual(getStepNeighbourSlot(list, 2, 1), { group: 2, index: 0 });
  assert.deepEqual(getStepNeighbourSlot(list, 3, 1), { group: 2, index: 1 });
  assert.equal(getStepNeighbourSlot(list, 0, -1), null);
  assert.equal(getStepNeighbourSlot(list, 4, 1), null);
  const up = moveStep(list, 1, getStepNeighbourSlot(list, 1, -1)!);
  assert.deepEqual(
    up.sections,
    [null, null, 'Sauce', 'Chicken', 'Chicken'],
    'moving up past a heading leaves its section',
  );
  assert.equal(canMoveStepSection(list, 1, -1), false);
  assert.equal(canMoveStepSection(list, 1, 1), true);
  assert.equal(canMoveStepSection(list, 2, 1), false);
}

const lines = [
  { id: 's1', group: 'Sauce' },
  { id: 'u1', group: null },
  { id: 'c1', group: 'Chicken' },
  { id: 's2', group: 'sauce ' },
  { id: 'u2', group: null },
];

{
  const moved = moveIngredientLine(lines, 'u1', { group: 2, index: 0 });
  assert.deepEqual(
    moved.map((line) => [line.id, line.group]),
    [
      ['u2', null],
      ['s1', 'Sauce'],
      ['s2', 'Sauce'],
      ['u1', 'Chicken'],
      ['c1', 'Chicken'],
    ],
    'lines are stored in drawn order and take the group spelled as its heading',
  );
}
{
  const moved = moveIngredientGroup(lines, 2, 1);
  assert.deepEqual(
    moved.map((line) => line.id),
    ['u1', 'u2', 'c1', 's1', 's2'],
  );
  assert.deepEqual(
    moveIngredientGroup(lines, 2, 0).map((line) => line.id),
    moved.map((line) => line.id),
    'ungrouped stays first',
  );
  assert.equal(moveIngredientGroup(lines, 0, 2), lines);
  assert.equal(canMoveIngredientGroup(lines, 1, -1), false);
  assert.equal(canMoveIngredientGroup(lines, 2, -1), true);
}
{
  assert.deepEqual(getLineNeighbourSlot(lines, 's1', -1), {
    group: 0,
    index: 2,
  });
  assert.deepEqual(getLineNeighbourSlot(lines, 'u2', 1), {
    group: 1,
    index: 0,
  });
  assert.equal(getLineNeighbourSlot(lines, 'c1', 1), null);
}

{
  const twice = {
    steps: ['a', 'b', 'c', 'd', 'e'],
    sections: ['Sauce', 'Chicken', 'sauce', 'Sauce ', null],
  };
  const moved = moveStepSection(twice, 2, 1);
  assert.deepEqual(
    moved.steps,
    ['a', 'c', 'd', 'b', 'e'],
    'two runs of one name are two sections',
  );
  const joined = moveStep(twice, 1, { group: 2, index: 1 });
  assert.deepEqual(joined.steps, ['a', 'c', 'b', 'd', 'e']);
  assert.equal(
    joined.index,
    2,
    'a step dropped in the second run of a shared name lands there',
  );
}
{
  const middle = {
    steps: ['a', 'b', 'c', 'd'],
    sections: [null, 'S', null, 'T'],
  };
  assert.deepEqual(
    moveStepSection(middle, 2, 1).steps,
    ['a', 'c', 'b', 'd'],
    'a later unnamed run moves like any other',
  );
  assert.deepEqual(
    moveStepSection(middle, 3, 0).steps,
    ['a', 'd', 'b', 'c'],
    'nothing goes before the leading unnamed run',
  );
  assert.equal(canMoveStepSection(middle, 1, -1), false);
  assert.equal(canMoveStepSection(middle, 2, -1), true);
  assert.equal(canMoveStepSection(middle, 2, 1), true);
  assert.deepEqual(getStepNeighbourSlot(middle, 2, -1), { group: 1, index: 1 });
}
{
  const ids = ['1', '2', '3', '4', '5'];
  const slots = [
    [1, { group: 2, index: 1 }],
    [0, { group: 1, index: 0 }],
    [4, { group: 0, index: 0 }],
  ] as const;
  slots.forEach(([from, slot]) => {
    const moved = moveStep(list, from, slot);
    const movedIds = moveStep(
      { steps: ids, sections: list.sections },
      from,
      slot,
    );
    assert.deepEqual(
      movedIds.steps,
      moved.steps.map((step) => ids[list.steps.indexOf(step)]),
      'a parallel ids array is permuted the same way',
    );
    assert.equal(movedIds.index, moved.index);
  });
}
{
  const ids = ['1', '2', '3', '4', '5'];
  const anchor = getSpanAnchor(ids, ['2', '3']);
  assert.deepEqual(anchor, {
    ids: ['2', '3'],
    before: '1',
    after: '4',
    index: 1,
  });
  assert.deepEqual(restoreSpanOrder(['1', '4', '2', '3', '5'], anchor), [
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  assert.deepEqual(
    restoreSpanOrder(['1', '4', '6', '2', '3', '5'], anchor),
    ['1', '2', '3', '4', '6', '5'],
    'an edit made since stays where it is',
  );
  assert.deepEqual(
    restoreSpanOrder(['1', '5', '3'], getSpanAnchor(ids, ['3'])),
    ['1', '5', '3'],
    'with both neighbours gone it goes to its old index',
  );
  assert.deepEqual(
    restoreSpanOrder(['5', '2', '1'], getSpanAnchor(ids, ['2'])),
    ['5', '1', '2'],
    'put back after the step that preceded it when the one after is gone',
  );
}

console.log('pinchReorder: ok');
