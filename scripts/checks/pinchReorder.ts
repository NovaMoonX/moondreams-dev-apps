import assert from 'node:assert/strict';

import {
  canMoveIngredientGroup,
  canMoveStepSection,
  getLineNeighbourSlot,
  getStepNeighbourSlot,
  moveIngredientGroup,
  moveIngredientLine,
  moveStep,
  moveStepSection,
} from '../../src/apps/pinch/utils/recipeReorder.ts';

const list = {
  steps: ['a', 'b', 'c', 'd', 'e'],
  sections: [null, 'Sauce', 'Sauce', 'Chicken', 'Chicken'],
};

{
  const moved = moveStep(list, 1, { group: 2, index: 1 });
  assert.deepEqual(moved.steps, ['a', 'c', 'd', 'b', 'e']);
  assert.deepEqual(moved.sections, [null, 'Sauce', 'Chicken', 'Chicken', 'Chicken']);
  assert.equal(moved.index, 3, 'a step dropped in another section takes its name');
}
{
  const moved = moveStep(list, 0, { group: 1, index: 0 });
  assert.deepEqual(moved.steps, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(moved.sections, ['Sauce', 'Sauce', 'Sauce', 'Chicken', 'Chicken']);
  assert.equal(moved.index, 0, 'the emptied run disappears');
}
{
  const moved = moveStepSection(list, 2, 1);
  assert.deepEqual(moved.steps, ['a', 'd', 'e', 'b', 'c']);
  assert.deepEqual(moved.sections, [null, 'Chicken', 'Chicken', 'Sauce', 'Sauce']);
  const pinned = moveStepSection(list, 2, 0);
  assert.deepEqual(pinned.steps, moved.steps, 'the leading unnamed run stays first');
  assert.deepEqual(moveStepSection(list, 0, 2), list, 'the leading unnamed run never moves');
}
{
  assert.deepEqual(getStepNeighbourSlot(list, 1, -1), { group: 0, index: 1 });
  assert.deepEqual(getStepNeighbourSlot(list, 2, 1), { group: 2, index: 0 });
  assert.deepEqual(getStepNeighbourSlot(list, 3, 1), { group: 2, index: 1 });
  assert.equal(getStepNeighbourSlot(list, 0, -1), null);
  assert.equal(getStepNeighbourSlot(list, 4, 1), null);
  const up = moveStep(list, 1, getStepNeighbourSlot(list, 1, -1)!);
  assert.deepEqual(up.sections, [null, null, 'Sauce', 'Chicken', 'Chicken'], 'moving up past a heading leaves its section');
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
    [['u2', null], ['s1', 'Sauce'], ['s2', 'Sauce'], ['u1', 'Chicken'], ['c1', 'Chicken']],
    'lines are stored in drawn order and take the group spelled as its heading',
  );
}
{
  const moved = moveIngredientGroup(lines, 2, 1);
  assert.deepEqual(moved.map((line) => line.id), ['u1', 'u2', 'c1', 's1', 's2']);
  assert.deepEqual(moveIngredientGroup(lines, 2, 0).map((line) => line.id), moved.map((line) => line.id), 'ungrouped stays first');
  assert.equal(moveIngredientGroup(lines, 0, 2), lines);
  assert.equal(canMoveIngredientGroup(lines, 1, -1), false);
  assert.equal(canMoveIngredientGroup(lines, 2, -1), true);
}
{
  assert.deepEqual(getLineNeighbourSlot(lines, 's1', -1), { group: 0, index: 2 });
  assert.deepEqual(getLineNeighbourSlot(lines, 'u2', 1), { group: 1, index: 0 });
  assert.equal(getLineNeighbourSlot(lines, 'c1', 1), null);
}

console.log('pinchReorder: ok');
