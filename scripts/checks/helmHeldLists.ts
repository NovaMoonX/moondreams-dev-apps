import assert from 'node:assert/strict';

import { toHeldWrite } from '../../src/utils/heldWrites.ts';
import {
  emptyHelmHeld,
  layHelmKind,
  type HelmHeldState,
} from '../../src/apps/helm/utils/heldLists.ts';
import type {
  OpenFact,
  OpenNote,
  OpenRun,
  OpenTask,
} from '../../src/apps/helm/types.ts';

const task = (id: string, fields: Partial<OpenTask> = {}): OpenTask =>
  ({
    id,
    status: 'open',
    projectId: null,
    createdAt: 1,
    title: id,
    ...fields,
  }) as OpenTask;

const withState = (change: (state: HelmHeldState) => void) => {
  const state = emptyHelmHeld();
  change(state);
  return state;
};

const ids = (list: { id: string }[] | undefined) =>
  (list ?? []).map((item) => item.id);

const open = task('a', { projectId: 'p' });
const done = { ...open, status: 'done' } as OpenTask;
const tasks = layHelmKind(
  'tasks',
  withState((state) => {
    state.incoming.openTasks = [open];
    state.incoming.projectTasks = [open];
    state.deliveredAt.openTasks = 1;
    state.deliveredAt.projectTasks = 1;
    state.held.tasks = [toHeldWrite('a', done, ['status'], 't')];
  }),
);
assert.deepEqual(
  ids(tasks.lists.openTasks),
  [],
  'a task ticked done leaves the open list at once',
);
assert.equal(
  tasks.lists.projectTasks?.[0].status,
  'done',
  'and shows done in its project',
);
assert.equal(
  tasks.held.length,
  1,
  'the hold stays until the project list shows it',
);

const notes = layHelmKind(
  'notes',
  withState((state) => {
    state.incoming.notes = [
      { id: 'old', createdAt: 5 } as OpenNote,
      { id: 'older', createdAt: 2 } as OpenNote,
    ];
    state.deliveredAt.notes = 1;
    state.held.notes = [
      toHeldWrite(
        'new',
        { id: 'new', createdAt: 9 } as OpenNote,
        ['createdAt'],
        't',
      ),
    ];
  }),
);
assert.deepEqual(
  ids(notes.lists.notes),
  ['new', 'old', 'older'],
  'a new note sits where the newest-first listener will put it',
);

const run = { id: 'r', finishedAt: null } as OpenRun;
const runs = layHelmKind(
  'runs',
  withState((state) => {
    state.incoming.openRuns = [run];
    state.deliveredAt.openRuns = 1;
    state.held.runs = [
      toHeldWrite('r', { ...run, finishedAt: 7 }, ['finishedAt'], 't'),
    ];
  }),
);
assert.deepEqual(
  ids(runs.lists.openRuns),
  [],
  'a finished run leaves the open runs',
);
assert.equal(
  runs.held.length,
  1,
  'the hold stays while the listener still has it open',
);
const runsLanded = layHelmKind(
  'runs',
  withState((state) => {
    state.deliveredAt.openRuns = 2;
    state.held.runs = runs.held;
  }),
);
assert.deepEqual(
  runsLanded.held,
  [],
  'and lets go once the list no longer has it',
);

const fact = { id: 'f', status: 'inferred', createdAt: 1 } as OpenFact;
const facts = layHelmKind(
  'facts',
  withState((state) => {
    state.incoming.facts = [fact];
    state.deliveredAt.facts = 1;
    state.held.facts = [toHeldWrite<OpenFact>('f', null, [], 't')];
  }),
);
assert.deepEqual(
  ids(facts.lists.facts),
  [],
  'a forgotten fact leaves the list at once',
);

const waiting = layHelmKind(
  'tasks',
  withState((state) => {
    state.deliveredAt.openTasks = 1;
    state.held.tasks = [toHeldWrite('n', task('n'), ['title'], 't')];
  }),
);
assert.deepEqual(
  ids(waiting.lists.openTasks),
  ['n'],
  'a held task shows in a list that has delivered without it',
);
assert.equal(
  waiting.lists.projectTasks,
  undefined,
  'a list still loading is left as it is, never filled with only the held record',
);
assert.deepEqual(
  waiting.landed,
  { 'n/t': [] },
  'and never counts the hold as shown there',
);

const unrelated = layHelmKind(
  'who',
  withState((state) => {
    state.incoming.who = [{ id: 'w' } as never];
    state.deliveredAt.who = 1;
  }),
);
assert.deepEqual(
  ids(unrelated.lists.who),
  ['w'],
  'a list with no holds is the listener’s own',
);

console.log('helm held lists: ok');
