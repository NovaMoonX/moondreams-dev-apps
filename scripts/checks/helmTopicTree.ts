import assert from 'node:assert/strict';

import {
  buildTopicTree,
  createRefusal,
  depthAfterMove,
  legalParents,
  liftChildren,
  moveRefusal,
  pathOf,
  subtreeOf,
  type TreeTopic,
} from '../../src/apps/helm/utils/topicTree.ts';

type T = TreeTopic & { name: string };

const topic = (
  id: string,
  name: string,
  parentId: string | null,
  depth: number,
): T => ({ id, name, parentId, depth });

// Car care > Washing > Foam; Car care > Fragrance; Kitchen > Baking; Wedding.
const topics: T[] = [
  topic('car', 'Car care', null, 1),
  topic('wash', 'Washing', 'car', 2),
  topic('foam', 'Foam', 'wash', 3),
  topic('frag', 'Fragrance', 'car', 2),
  topic('kit', 'Kitchen', null, 1),
  topic('bake', 'Baking', 'kit', 2),
  topic('wed', 'Wedding etiquette', null, 1),
];

const tree = buildTopicTree(topics);
assert.deepEqual(
  tree.map((node) => node.topic.name),
  ['Car care', 'Kitchen', 'Wedding etiquette'],
  'the top level reads A to Z',
);
assert.deepEqual(
  tree[0].children.map((node) => node.topic.name),
  ['Fragrance', 'Washing'],
  'a level reads A to Z',
);
assert.deepEqual(pathOf('foam', topics), ['Car care', 'Washing', 'Foam']);
assert.deepEqual(
  buildTopicTree([topic('lost', 'Lost', 'gone', 2)]).map((n) => n.topic.id),
  ['lost'],
  'a topic whose parent is missing stands at the top',
);

// Into its own subtopic, or itself: refused and never offered.
assert.equal(moveRefusal('car', 'wash', topics), 'descendant');
assert.equal(moveRefusal('car', 'foam', topics), 'descendant');
assert.equal(moveRefusal('car', 'car', topics), 'self');
assert.ok(
  !legalParents('car', topics).some((entry) =>
    ['car', 'wash', 'foam', 'frag'].includes(entry.id),
  ),
);

// Past three levels: Car care (height 3) goes under no one; Washing (height 2) under a top topic only if it fits.
assert.equal(moveRefusal('car', 'kit', topics), 'tooDeep');
assert.equal(moveRefusal('car', 'bake', topics), 'tooDeep');
assert.equal(moveRefusal('wash', 'kit', topics), null);
assert.equal(moveRefusal('wash', 'bake', topics), 'tooDeep');
assert.equal(moveRefusal('foam', 'bake', topics), null);
assert.equal(moveRefusal('wed', 'foam', topics), 'tooDeep');
assert.deepEqual(
  legalParents('wed', topics)
    .map((entry) => entry.id)
    .sort(),
  ['bake', 'car', 'frag', 'kit', 'wash'].sort(),
);
assert.equal(moveRefusal('foam', null, topics), null, 'the top level is legal');
assert.equal(moveRefusal('wed', null, topics), 'unchanged');
assert.equal(moveRefusal('wed', 'gone', topics), 'missing');

// A 21st child is refused, and a create past the caps too.
const crowded: T[] = [
  topic('p', 'Parent', null, 1),
  ...Array.from({ length: 20 }, (_, index) =>
    topic(`c${index}`, `Child ${index}`, 'p', 2),
  ),
  topic('x', 'Other', null, 1),
];
assert.equal(moveRefusal('x', 'p', crowded), 'tooMany');
assert.equal(createRefusal('p', crowded), 'tooMany');
assert.equal(createRefusal(null, crowded), null);
assert.equal(createRefusal('c0', crowded), null);
assert.equal(createRefusal('foam', topics), 'tooDeep');
assert.equal(createRefusal('car', topics), null);
assert.equal(
  createRefusal(
    null,
    Array.from({ length: 100 }, (_, index) =>
      topic(`t${index}`, `T${index}`, null, 1),
    ),
  ),
  'full',
);

// A valid move recomputes depth for the whole subtree.
const moved = depthAfterMove('wash', 'kit', topics);
assert.deepEqual(
  moved.map(({ id, parentId, depth }) => [id, parentId, depth]),
  [
    ['wash', 'kit', 2],
    ['foam', 'wash', 3],
  ],
);
assert.deepEqual(
  depthAfterMove('foam', null, topics).map(({ depth }) => depth),
  [1],
);
assert.deepEqual(
  depthAfterMove('car', null, topics).map(({ id, depth }) => [id, depth]),
  [
    ['car', 1],
    ['wash', 2],
    ['frag', 2],
    ['foam', 3],
  ],
);
assert.deepEqual(
  subtreeOf('car', topics).map((entry) => entry.id),
  ['car', 'wash', 'frag', 'foam'],
);

// Deleting a parent lifts its children one level, to the deleted topic's parent.
assert.deepEqual(
  liftChildren('wash', topics).map(({ id, parentId, depth }) => [
    id,
    parentId,
    depth,
  ]),
  [['foam', 'car', 2]],
);
assert.deepEqual(
  liftChildren('car', topics).map(({ id, parentId, depth }) => [
    id,
    parentId,
    depth,
  ]),
  [
    ['wash', null, 1],
    ['frag', null, 1],
    ['foam', 'wash', 2],
  ],
);
assert.deepEqual(liftChildren('wed', topics), []);

// A cycle in the data never loops.
const cyclic: T[] = [topic('a', 'A', 'b', 1), topic('b', 'B', 'a', 2)];
assert.deepEqual(buildTopicTree(cyclic), []);
assert.equal(subtreeOf('a', cyclic).length, 2);

console.log(
  'check:helm-topic-tree: depth, cycles, caps, move and delete hold.',
);
