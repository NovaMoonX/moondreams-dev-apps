import assert from 'node:assert/strict';

import {
  createAliasBook,
  createSyncedBook,
} from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  buildContext,
  MAX_CONTEXT_RUN_STEPS,
  MAX_CONTEXT_RUNS,
  type ContextRun,
} from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type {
  CaptureReading,
  RunCommand,
  StartRunCommand,
  TickRunCommand,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import * as serverCommands from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planWrites,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planRunCommands,
  type RunPlanInput,
} from '../../functions/src/apps/helm/nomos/planRunCommands.ts';
import {
  hasRunStartCue,
  hasTickCue,
} from '../../functions/src/apps/helm/nomos/route.ts';
import { sanitizeScreen } from '../../functions/src/apps/helm/nomos/sanitizeScreen.ts';
import { describeRunChanges } from '../../functions/src/apps/helm/nomos/summaries.ts';
import type { LiveProcedure } from '../../functions/src/apps/helm/procedureStore.ts';
import {
  toContextRun,
  type LiveRun,
} from '../../functions/src/apps/helm/runStore.ts';
import type { SyncedCopy } from '../../functions/src/apps/helm/syncedCopies.ts';
import * as deviceLimits from '../../src/apps/helm/constants.ts';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const seal = (fields: Record<string, unknown>) => fields as never;
let counter = 0;
const newId = () => `id-${(counter += 1)}`;

const reading: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const trip: SyncedCopy = {
  id: 'trip-1',
  connectorId: 'app:waypoint',
  accountId: 'site',
  kind: 'trip',
  category: null,
  title: 'Pacific Northwest Weekend',
  subtitle: null,
  startAt: Date.UTC(2026, 5, 20),
  endAt: Date.UTC(2026, 5, 23),
  dueAt: null,
  isAllDay: true,
  isEnded: false,
  detail: null,
  placeLabel: null,
  amountCents: null,
  currency: null,
  extra: {},
  asOf: null,
};
const timedEvent: SyncedCopy = {
  ...trip,
  id: 'event-1',
  kind: 'event',
  title: 'Flight DL 482',
  startAt: Date.UTC(2026, 5, 20, 3, 30),
  endAt: Date.UTC(2026, 5, 20, 8),
  isAllDay: false,
};
const stay: SyncedCopy = {
  ...timedEvent,
  id: 'stay-1',
  category: 'itinerary',
  title: 'Hotel Lucia',
};
const shared: SyncedCopy = { ...trip, id: 'task-copy', kind: 'task' };

const liveProcedure = (): LiveProcedure => ({
  id: 'proc-1',
  title: 'Packing for a work trip',
  version: 3,
  stepState: {
    a: { order: 0, groupId: null },
    b: { order: 1, groupId: 'g1' },
    c: { order: 2, groupId: 'g1' },
    d: { order: 3, groupId: 'g2' },
  },
  groupOrder: ['g1', 'g2'],
  steps: {
    a: { text: 'Check the weather', detail: 'Look at the week' },
    b: { text: 'Shirts', detail: null },
    c: { text: 'Trousers', detail: null },
    d: { text: 'Phone charger', detail: null },
  },
  groups: { g1: { name: 'Clothes' }, g2: { name: 'Electronics' } },
  sourceTaskId: null,
});

const liveRun = (over: Partial<LiveRun> = {}): LiveRun => ({
  id: 'run-1',
  title: 'Packing for a work trip',
  procedureId: 'proc-1',
  procedureVersion: 3,
  attachedTo: { kind: 'synced', id: 'trip-1' },
  attachedLabel: 'Pacific Northwest Weekend',
  dueOn: trip.startAt,
  stepState: {
    a: { order: 0, groupId: null, doneAt: NOW - 1, isExtra: false },
    b: { order: 1, groupId: 'g1', doneAt: null, isExtra: false },
    c: { order: 2, groupId: 'g1', doneAt: null, isExtra: false },
    d: { order: 3, groupId: 'g2', doneAt: null, isExtra: false },
    x: { order: 4, groupId: null, doneAt: null, isExtra: true },
  },
  groupOrder: ['g1', 'g2'],
  steps: {
    a: { text: 'Check the weather', detail: null },
    b: { text: 'Shirts', detail: null },
    c: { text: 'Trousers', detail: null },
    d: { text: 'Phone charger', detail: null },
    x: { text: 'Umbrella', detail: null },
  },
  groups: { g1: { name: 'Clothes' }, g2: { name: 'Electronics' } },
  startedAt: NOW - DAY,
  finishedAt: null,
  ...over,
});

// 1. Starting a run is kept only on words that ask for it.
const startRow = (over: Record<string, unknown> = {}) => ({
  kind: 'startRun',
  procedureAlias: 'pr1',
  aboutAlias: null,
  projectRef: null,
  runStepAliases: null,
  requestQuote: 'start packing for the weekend',
  ...over,
});
const tickRow = (over: Record<string, unknown> = {}) => ({
  kind: 'tickRun',
  runStepAliases: ['rs1'],
  requestQuote: 'done with the shirts',
  ...over,
});
const norm = (text: string, items: Record<string, unknown>[]) => {
  const procedures = createAliasBook('pr');
  procedures.add('proc-1');
  const runSteps = createAliasBook('rs');
  ['run-1:b', 'run-1:c', 'run-2:z'].forEach((id) => runSteps.add(id));
  const synced = createSyncedBook();
  [trip, timedEvent, shared, stay].forEach((copy) => synced.add(copy));
  return normalizeNomosReply(
    { commands: items, mentions: [], places: [] },
    {
      reading,
      aliases: createAliasBook('t'),
      procedures,
      runSteps,
      synced,
      captureText: text,
    },
  );
};

assert.ok(hasRunStartCue('Start packing'));
assert.ok(hasRunStartCue('let us begin the checklist'));
assert.ok(!hasRunStartCue('the restart button'));

assert.ok(hasTickCue('packed the charger'));
assert.ok(hasTickCue('Done with the shirts'));
assert.ok(!hasTickCue('I still need to buy the phone charger'));
assert.ok(!hasTickCue("haven't packed the charger"));
assert.ok(!hasTickCue('have not packed the charger'));
assert.ok(!hasTickCue('forgot to pack the charger'));
assert.ok(!hasTickCue('the charger'));

const started = norm('Start packing for the weekend', [startRow()]);
assert.deepEqual(started.runDropped, []);
assert.equal(started.runCommands.length, 1);
assert.equal(started.commands.length, 0);
assert.deepEqual(
  norm('Start packing for the weekend', [
    startRow({ requestQuote: 'something never said' }),
  ]).runDropped,
  ['run-start-unasked'],
);
assert.deepEqual(
  norm('packing is on my mind', [startRow({ requestQuote: 'packing is on' })])
    .runDropped,
  ['run-start-unasked'],
);
assert.deepEqual(
  norm('Start', [startRow({ requestQuote: 'start' })]).runDropped,
  ['run-start-unasked'],
);
assert.deepEqual(
  norm('Start packing for the weekend', [startRow({ procedureAlias: 'pr9' })])
    .runDropped,
  ['run-start-unknown'],
);
assert.deepEqual(
  norm('Start packing for the weekend', [startRow(), startRow()]).runDropped,
  ['run-start-extra'],
);
const forTrip = norm('Start packing for the weekend', [
  startRow({ aboutAlias: 's1', projectRef: 'Move' }),
]).runCommands[0] as StartRunCommand;
assert.equal(forTrip.about?.id, 'trip-1');
const forEvent = norm('Start packing for the weekend', [
  startRow({ aboutAlias: 'e1' }),
]).runCommands[0] as StartRunCommand;
assert.equal(forEvent.about?.id, 'event-1');
assert.deepEqual(
  norm('Start packing for the weekend', [startRow({ aboutAlias: 'e2' })])
    .runDropped,
  ['run-start-itinerary'],
);
const forTask = norm('Start packing for the weekend', [
  startRow({ aboutAlias: 's2', projectRef: '  Move  ' }),
]).runCommands[0] as StartRunCommand;
assert.equal(forTask.about, null);
assert.equal(forTask.projectRef, 'Move');

// 2. Ticking is kept only for undone steps the context listed, on the turn's own words.
const ticked = norm('Done with the shirts', [tickRow()]);
assert.deepEqual(ticked.runDropped, []);
assert.deepEqual((ticked.runCommands[0] as TickRunCommand).steps, [
  { runId: 'run-1', stepId: 'b' },
]);
assert.deepEqual(
  norm('Done with the shirts', [
    tickRow({ requestQuote: 'finished the trousers' }),
  ]).runDropped,
  ['run-tick-unasked'],
);
assert.deepEqual(
  norm('Done with the shirts', [tickRow({ runStepAliases: ['rs9'] })])
    .runDropped,
  ['run-tick-unknown'],
);
assert.deepEqual(
  norm('Done with the shirts', [tickRow({ runStepAliases: null })]).runDropped,
  ['run-tick-unknown'],
);
const tickQuoteAlias = (text: string) =>
  norm(text, [tickRow({ requestQuote: text })]).runDropped;
assert.deepEqual(tickQuoteAlias('I still need to buy the phone charger'), [
  'run-tick-unasked',
]);
assert.deepEqual(tickQuoteAlias("haven't packed the charger"), [
  'run-tick-unasked',
]);
assert.deepEqual(tickQuoteAlias('packed the charger'), []);
const twice = norm('Done with the shirts', [
  tickRow({ runStepAliases: ['rs1', 'rs1', 'rs2', 'rs3'] }),
]).runCommands[0] as TickRunCommand;
assert.deepEqual(
  twice.steps.map((entry) => `${entry.runId}:${entry.stepId}`),
  ['run-1:b', 'run-1:c', 'run-2:z'],
);
const manyBook = createAliasBook('rs');
Array.from({ length: 30 }, (_, i) => manyBook.add(`run-1:s${i}`));
const capped = normalizeNomosReply(
  {
    commands: [
      tickRow({
        runStepAliases: Array.from({ length: 30 }, (_, i) => `rs${i + 1}`),
      }),
      tickRow({ runStepAliases: ['rs30'] }),
    ],
    mentions: [],
    places: [],
  },
  {
    reading,
    aliases: createAliasBook('t'),
    runSteps: manyBook,
    captureText: 'Done with the shirts',
  },
);
assert.equal(
  capped.runCommands.reduce(
    (total, command) =>
      total + (command.kind === 'tickRun' ? command.steps.length : 0),
    0,
  ),
  20,
);

// 3. Planning.
const input = (
  commands: RunCommand[],
  over: Partial<RunPlanInput> = {},
): RunPlanInput => ({
  commands,
  liveProcedures: new Map([['proc-1', liveProcedure()]]),
  liveRuns: new Map(),
  openRuns: [],
  goneProcedureIds: new Set(),
  projects: [{ id: 'project-1', name: 'Move' }],
  timeZone: 'America/Los_Angeles',
  captureId: 'cap-1',
  executionId: 'exec-1',
  now: NOW,
  newId,
  seal,
  room: 20,
  ...over,
});
const start = (over: Partial<StartRunCommand> = {}): StartRunCommand => ({
  kind: 'startRun',
  procedureId: 'proc-1',
  about: trip,
  projectRef: null,
  requestQuote: 'start packing',
  ...over,
});
const tick = (...ids: string[]): TickRunCommand => ({
  kind: 'tickRun',
  steps: ids.map((id) => {
    const [runId, stepId] = id.split(':');
    return { runId, stepId };
  }),
  requestQuote: 'done with it',
});
interface RunDocShape {
  procedureId: string;
  procedureVersion: number;
  attachedTo: { kind: string; id: string } | null;
  dueOn: number | null;
  stepState: Record<string, { doneAt: number | null; isExtra: boolean }>;
  groupOrder: string[];
  startedAt: number;
  finishedAt: number | null;
  createdBy: string;
  executionId: string;
  lastEditedAt: number | null;
  sealed: {
    title: string;
    steps: Record<string, { detail: string | null }>;
    groups: Record<string, { name: string }>;
    attachedLabel: string | null;
  };
}
const docOf = (plan: { creates: { doc: Record<string, unknown> }[] }) =>
  plan.creates[0].doc as unknown as RunDocShape;

const made = planRunCommands(input([start()]));
assert.equal(made.creates.length, 1);
assert.deepEqual(made.lines, [
  'Started Packing for a work trip for Pacific Northwest Weekend',
]);
const runDoc = docOf(made);
assert.equal(runDoc.procedureId, 'proc-1');
assert.equal(runDoc.procedureVersion, 3);
assert.deepEqual(runDoc.attachedTo, { kind: 'synced', id: 'trip-1' });
assert.equal(runDoc.dueOn, trip.startAt);
assert.equal(runDoc.finishedAt, null);
assert.equal(runDoc.createdBy, 'nomos');
assert.equal(runDoc.executionId, 'exec-1');
assert.equal(runDoc.lastEditedAt, null);
assert.equal(runDoc.startedAt, NOW);
assert.deepEqual(runDoc.groupOrder, ['g1', 'g2']);
assert.deepEqual(Object.keys(runDoc.stepState), ['a', 'b', 'c', 'd']);
assert.ok(
  Object.values(runDoc.stepState).every(
    (place) => place.doneAt === null && place.isExtra === false,
  ),
);
assert.equal(runDoc.sealed.title, 'Packing for a work trip');
assert.equal(runDoc.sealed.steps.a.detail, 'Look at the week');
assert.equal(runDoc.sealed.groups.g2.name, 'Electronics');
assert.equal(runDoc.sealed.attachedLabel, 'Pacific Northwest Weekend');
assert.deepEqual(made.effects[0].ref, {
  op: 'create',
  collection: 'procedureRuns',
  docId: made.creates[0].id,
});
assert.deepEqual(made.effects[0].effect, {
  written: {
    'sealed.title':
      'Started Packing for a work trip for Pacific Northwest Weekend',
    'sealed.name': 'Packing for a work trip',
  },
  previous: null,
});

const alone = planRunCommands(input([start({ about: null })]));
assert.deepEqual(alone.lines, ['Started Packing for a work trip']);
assert.equal(docOf(alone).attachedTo, null);
const timed = planRunCommands(input([start({ about: timedEvent })]));
assert.equal(docOf(timed).dueOn, Date.UTC(2026, 5, 19));
const forProject = planRunCommands(
  input([start({ about: null, projectRef: 'the Move' })]),
);
assert.deepEqual(docOf(forProject).attachedTo, {
  kind: 'project',
  id: 'project-1',
});
assert.deepEqual(forProject.lines, [
  'Started Packing for a work trip for Move',
]);
const unknownProject = planRunCommands(
  input([start({ about: null, projectRef: 'Garden' })]),
);
assert.equal(unknownProject.creates.length, 0);
assert.deepEqual(unknownProject.notKept, [
  "Couldn't find a project called Garden",
]);
const goneProcedure = planRunCommands(
  input([start()], { liveProcedures: new Map([['proc-1', null]]) }),
);
assert.deepEqual(goneProcedure.notKept, ['That procedure is gone']);
const running = planRunCommands(input([start()], { openRuns: [liveRun()] }));
assert.equal(running.creates.length, 0);
assert.deepEqual(running.notKept, [
  'Packing for a work trip is already running for Pacific Northwest Weekend',
]);
assert.equal(
  planRunCommands(input([start({ about: null })], { openRuns: [liveRun()] }))
    .creates.length,
  1,
);
assert.equal(
  planRunCommands(
    input([start()], { openRuns: [liveRun({ finishedAt: NOW })] }),
  ).creates.length,
  1,
  'a finished run does not block a new one',
);
assert.equal(
  planRunCommands(
    input([start()], { openRuns: [liveRun({ procedureId: 'proc-2' })] }),
  ).creates.length,
  1,
);
assert.equal(planRunCommands(input([start()], { room: 0 })).creates.length, 0);
const noSteps = planRunCommands(
  input([start()], {
    liveProcedures: new Map([
      ['proc-1', { ...liveProcedure(), steps: {}, stepState: {} }],
    ]),
  }),
);
assert.equal(noSteps.creates.length, 0);
assert.equal(noSteps.notKept.length, 1);
const bigRows = Array.from({ length: 90 }, (_, i) => `s${i}`);
const cut = planRunCommands(
  input([start()], {
    liveProcedures: new Map([
      [
        'proc-1',
        {
          ...liveProcedure(),
          groupOrder: [],
          groups: {},
          stepState: Object.fromEntries(
            bigRows.map((id, i) => [id, { order: i, groupId: null }]),
          ),
          steps: Object.fromEntries(
            bigRows.map((id, i) => [id, { text: `Step ${i}`, detail: null }]),
          ),
        },
      ],
    ]),
  }),
);
assert.equal(Object.keys(docOf(cut).stepState).length, 80);

const withRun = { liveRuns: new Map([['run-1', liveRun()]]) };
const ticks = planRunCommands(input([tick('run-1:b')], withRun));
assert.deepEqual(ticks.ticks, [{ runId: 'run-1', stepIds: ['b'] }]);
assert.deepEqual(ticks.lines, ['Ticked Shirts on Packing for a work trip']);
assert.deepEqual(ticks.effects[0].ref, {
  op: 'update',
  collection: 'procedureRuns',
  docId: 'run-1',
});
assert.deepEqual(ticks.effects[0].effect, {
  written: {
    'stepState.b.doneAt': NOW,
    'sealed.title': 'Ticked Shirts on Packing for a work trip',
  },
  previous: {
    'stepState.b.doneAt': null,
    'sealed.title': 'Ticked Shirts on Packing for a work trip',
  },
});
const several = planRunCommands(
  input([tick('run-1:b', 'run-1:d', 'run-1:b')], withRun),
);
assert.equal(several.effects.length, 1);
assert.deepEqual(several.ticks[0].stepIds, ['b', 'd']);
assert.deepEqual(several.lines, [
  'Ticked Shirts and Phone charger on Packing for a work trip',
]);
assert.deepEqual(Object.keys(several.effects[0].effect.written).sort(), [
  'sealed.title',
  'stepState.b.doneAt',
  'stepState.d.doneAt',
]);
const three = planRunCommands(
  input([tick('run-1:b', 'run-1:c', 'run-1:d')], withRun),
);
assert.deepEqual(three.lines, [
  'Ticked Shirts, Trousers and 1 more on Packing for a work trip',
]);
const orphaned = planRunCommands(
  input([tick('run-1:b')], {
    ...withRun,
    goneProcedureIds: new Set(['proc-1']),
  }),
);
assert.equal(orphaned.ticks.length, 0);
assert.deepEqual(orphaned.lines, []);
assert.deepEqual(orphaned.notKept, []);
const already = planRunCommands(input([tick('run-1:a')], withRun));
assert.equal(already.ticks.length, 0);
assert.deepEqual(already.notKept, ['Already ticked']);
const partly = planRunCommands(input([tick('run-1:a', 'run-1:b')], withRun));
assert.deepEqual(partly.ticks[0].stepIds, ['b']);
const finished = planRunCommands(
  input([tick('run-1:b')], {
    liveRuns: new Map([['run-1', liveRun({ finishedAt: NOW })]]),
  }),
);
assert.equal(finished.ticks.length, 0);
assert.deepEqual(finished.notKept, ['That run is finished or gone']);
assert.deepEqual(
  planRunCommands(
    input([tick('run-9:b')], { liveRuns: new Map([['run-9', null]]) }),
  ).notKept,
  ['That run is finished or gone'],
);
assert.equal(
  planRunCommands(input([tick('run-1:nope')], withRun)).ticks.length,
  0,
);
const bothRuns = {
  liveRuns: new Map([
    ['run-1', liveRun()],
    ['run-2', liveRun({ id: 'run-2' })],
  ]),
};
assert.equal(
  planRunCommands(input([tick('run-1:b', 'run-2:b')], bothRuns)).effects.length,
  2,
);
assert.equal(
  planRunCommands(input([tick('run-1:b', 'run-2:b')], { ...bothRuns, room: 1 }))
    .effects.length,
  1,
);

// 4. The turn's write plan and its summary.
assert.equal(describeRunChanges(1, 0), 'Started a run');
assert.equal(describeRunChanges(2, 0), 'Started 2 runs');
assert.equal(describeRunChanges(0, 1), 'Ticked a step');
assert.equal(describeRunChanges(0, 2), 'Ticked 2 steps');
assert.equal(describeRunChanges(1, 2), 'Started a run · Ticked 2 steps');
assert.equal(describeRunChanges(0, 0), null);
const written = planWrites({
  commands: [],
  existing: new Map(),
  captureId: 'cap-1',
  executionId: 'exec-1',
  now: NOW,
  seal,
  newId,
  timeZone: 'UTC',
  runCommands: [start(), tick('run-1:b', 'run-1:c')],
  liveProcedures: new Map([['proc-1', liveProcedure()]]),
  liveRuns: new Map([['run-1', liveRun()]]),
  openRuns: [],
});
assert.equal(written.runCreates.length, 1);
assert.equal(written.runTicks.length, 1);
assert.deepEqual(
  written.effectRefs.map((ref) => `${ref.op}:${ref.collection}`),
  ['create:procedureRuns', 'update:procedureRuns'],
);
const execution = buildExecution(written, {
  homeLine: null,
  questionRef: null,
  commands: [],
  captureId: 'cap-1',
  now: NOW,
  seal,
  messageCount: 1,
  inputMode: 'text',
  timeZone: 'UTC',
} as never);
assert.ok(
  String((execution.sealed as { summary: string }).summary).includes(
    'Started a run · Ticked 2 steps',
  ),
);
const refused = planWrites({
  commands: [],
  existing: new Map(),
  captureId: 'cap-1',
  executionId: 'exec-1',
  now: NOW,
  seal,
  newId,
  runCommands: [tick('run-1:a')],
  liveRuns: new Map([['run-1', liveRun()]]),
});
assert.equal(refused.effects.length, 0);
assert.deepEqual(refused.notKept, ['Already ticked']);

// 5. What the context tells the model.
const contextRun = (
  id: string,
  undone: number,
  isOpen = false,
): ContextRun => ({
  id,
  title: `Run ${id}`,
  forLabel: id === 'r1' ? 'The trip' : null,
  isOpen,
  doneCount: 1,
  total: undone + 1,
  undone: Array.from({ length: undone }, (_, i) => ({
    id: `${id}-s${i}`,
    text: `Step ${i}`,
    group: null,
  })),
});
const ctx = (runs: ContextRun[]) =>
  buildContext({
    text: 'x',
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    runs,
  });
const openRuns = (message: string) =>
  JSON.parse(message.match(/<open_runs>(.*)<\/open_runs>/)?.[1] ?? 'null');
const small = ctx([contextRun('r1', 2, true)]);
assert.deepEqual(openRuns(small.message), [
  {
    title: 'Run r1',
    for: 'The trip',
    isOpen: true,
    done: '1 of 3',
    undone: [
      { step: 'rs1', text: 'Step 0', group: null },
      { step: 'rs2', text: 'Step 1', group: null },
    ],
  },
]);
assert.equal(small.runSteps.idOf('rs2'), 'r1:r1-s1');
assert.equal(ctx([]).message.includes('open_runs'), false);
const crowded = ctx(
  Array.from({ length: MAX_CONTEXT_RUNS + 3 }, (_, i) =>
    contextRun(`r${i}`, 30),
  ),
);
const shown = openRuns(crowded.message) as { undone: unknown[] }[];
assert.equal(shown.length, MAX_CONTEXT_RUNS);
assert.equal(
  shown.reduce((total, run) => total + run.undone.length, 0),
  MAX_CONTEXT_RUN_STEPS,
);
assert.equal(crowded.runSteps.idOf(`rs${MAX_CONTEXT_RUN_STEPS + 1}`), null);
const opened = toContextRun(liveRun(), true);
assert.equal(opened.doneCount, 1);
assert.equal(opened.total, 5);
assert.deepEqual(
  opened.undone.map((step) => [step.text, step.group]),
  [
    ['Umbrella', null],
    ['Shirts', 'Clothes'],
    ['Trousers', 'Clothes'],
    ['Phone charger', 'Electronics'],
  ],
);
assert.ok(
  buildContext({
    text: 'x',
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    synced: [trip],
  }).message.includes('"kind":"trip"'),
);

// 6. The screen the person is on.
assert.equal(sanitizeScreen({ view: 'run', runId: 'run-1' })?.runId, 'run-1');
assert.equal(
  sanitizeScreen({ view: 'procedure', runId: 'run-1' })?.runId,
  undefined,
);
assert.equal(
  sanitizeScreen({ view: 'run', runId: 'bad id!' })?.runId,
  undefined,
);
assert.equal(sanitizeScreen({ view: 'run' })?.view, 'run');

// 7. The emulator's phrases, end to end through the guards.
const toolRequest = (message: string) =>
  ({
    role: 'interpret',
    system: '',
    messages: [{ role: 'user', content: message }],
    terminalTool: { name: 'file_results', description: '', inputSchema: {} },
    limits: { maxTurns: 1, maxToolCalls: 1, maxMillis: 5_000 },
  }) as never;
const runFixture = async (
  text: string,
  over: { runs?: ContextRun[]; synced?: SyncedCopy[] } = {},
) => {
  const context = buildContext({
    text,
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    procedures: [
      { id: 'proc-1', title: 'Packing for a work trip', stepCount: 4 },
    ],
    ...over,
  });
  const loop = await createFixtureProvider(text, reading).runToolLoop(
    toolRequest(context.message),
  );
  return normalizeNomosReply(loop.terminalInput, {
    reading,
    aliases: context.aliases,
    synced: context.synced,
    procedures: context.procedures,
    runSteps: context.runSteps,
    captureText: text,
  });
};
const forWeekend = await runFixture(
  'Start packing for the Pacific Northwest weekend',
  { synced: [trip] },
);
assert.deepEqual(forWeekend.runDropped, []);
const fixtureStart = forWeekend.runCommands[0] as StartRunCommand;
assert.equal(fixtureStart.procedureId, 'proc-1');
assert.equal(fixtureStart.about?.id, 'trip-1');
const withoutTrip = await runFixture(
  'Start packing for the Pacific Northwest weekend',
);
assert.equal((withoutTrip.runCommands[0] as StartRunCommand).about, null);
const chargers = await runFixture('Done with the charger', {
  runs: [toContextRun(liveRun(), false)],
});
assert.deepEqual(chargers.runDropped, []);
assert.deepEqual((chargers.runCommands[0] as TickRunCommand).steps, [
  { runId: 'run-1', stepId: 'd' },
]);
assert.equal((await runFixture('Done with the charger')).runCommands.length, 0);

// 8. The server's limits are the device's.
const limits = {
  RUN_STEPS_MAX: 80,
  RUN_EXTRA_MAX: 20,
  RUN_EXTRA_TEXT_CAP: 200,
  PROCEDURE_GROUPS_MAX: 12,
} as const;
Object.entries(limits).forEach(([name, value]) => {
  assert.equal(
    (serverCommands as Record<string, unknown>)[name],
    value,
    `server ${name}`,
  );
  const device = (deviceLimits as Record<string, unknown>)[name];
  if (device !== undefined) assert.equal(device, value, `device ${name}`);
});
assert.equal(serverCommands.MAX_TICKS_PER_TURN, 20);

console.log('helm runs: ok');
