import assert from 'node:assert/strict';

import {
  arrayRemove,
  arrayUnion,
  deleteField,
  increment,
  serverTimestamp,
} from 'firebase/firestore';

import { projectWrites } from '../../src/lib/firebase/projectWrites.ts';

const at = (path: string) => path.split('/');

const only = (
  writes: Parameters<typeof projectWrites>[0],
  bases: Record<string, Record<string, unknown> | null>,
) => {
  const [result] = projectWrites(writes, (path) => bases[path]);
  return result;
};

assert.deepEqual(
  only(
    [
      {
        segments: at('a/1'),
        op: 'update',
        data: {
          sealed: 'new',
          'stepState.s2': { order: 2, doneAt: null },
          'stepState.s1': deleteField(),
        },
        isMerge: true,
      },
    ],
    { 'a/1': { sealed: 'old', stepState: { s1: { order: 1 } }, keep: 1 } },
  ),
  {
    segments: at('a/1'),
    before: { sealed: 'old', stepState: { s1: { order: 1 } }, keep: 1 },
    after: {
      sealed: 'new',
      stepState: { s2: { order: 2, doneAt: null } },
      keep: 1,
    },
  },
  'an update with dotted paths and a deleted field',
);

assert.deepEqual(
  only(
    [
      {
        segments: at('a/1'),
        op: 'update',
        data: {
          ids: arrayUnion('b', 'c'),
          gone: arrayRemove('x'),
          count: increment(2),
        },
        isMerge: true,
      },
    ],
    { 'a/1': { ids: ['a', 'b'], gone: ['x', 'y'], count: 3 } },
  ),
  {
    segments: at('a/1'),
    before: { ids: ['a', 'b'], gone: ['x', 'y'], count: 3 },
    after: { ids: ['a', 'b', 'c'], gone: ['y'], count: 5 },
  },
  'array union, array remove and increment over the base',
);

assert.deepEqual(
  only(
    [
      {
        segments: at('a/1'),
        op: 'set',
        data: { meta: { b: 2 }, tags: arrayUnion('t') },
        isMerge: true,
      },
    ],
    { 'a/1': { meta: { a: 1 }, other: true } },
  ),
  {
    segments: at('a/1'),
    before: { meta: { a: 1 }, other: true },
    after: { meta: { a: 1, b: 2 }, other: true, tags: ['t'] },
  },
  'a merge set merges maps deeply',
);

assert.deepEqual(
  only(
    [{ segments: at('a/1'), op: 'set', data: { x: 1 }, isMerge: false }],
    {},
  ),
  { segments: at('a/1'), before: null, after: { x: 1 } },
  'a full set on an unknown base is a create',
);

assert.deepEqual(
  only(
    [{ segments: at('a/1'), op: 'update', data: { x: 1 }, isMerge: true }],
    {},
  ),
  { segments: at('a/1'), isUnknown: true },
  'an update on an unknown base is unknown',
);

assert.deepEqual(
  only(
    [
      {
        segments: at('a/1'),
        op: 'update',
        data: { at: serverTimestamp() },
        isMerge: true,
      },
    ],
    { 'a/1': { at: 1 } },
  ),
  { segments: at('a/1'), isUnknown: true },
  'a server timestamp is unknown',
);

assert.deepEqual(
  projectWrites(
    [
      {
        segments: at('a/1'),
        op: 'set',
        data: { n: 1, tag: 'x' },
        isMerge: false,
      },
      {
        segments: at('a/1'),
        op: 'update',
        data: { n: increment(1) },
        isMerge: true,
      },
      { segments: at('a/2'), op: 'delete', data: null, isMerge: false },
    ],
    (path) => (path === 'a/2' ? { y: 1 } : undefined),
  ),
  [
    { segments: at('a/1'), before: null, after: { n: 2, tag: 'x' } },
    { segments: at('a/2'), before: { y: 1 }, after: null },
  ],
  'writes to one document build on each other; a delete is null',
);

console.log('project writes: ok');
