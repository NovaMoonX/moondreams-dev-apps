import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  buildContext,
  type ContextFocusedProcedure,
} from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type {
  CaptureReading,
  CreateProcedureCommand,
  ModelProcedureStep,
  ProcedureCommand,
  ReviseProcedureCommand,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import * as serverCommands from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planWrites,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planProcedureCommands,
  type ProcedurePlanInput,
} from '../../functions/src/apps/helm/nomos/planProcedureCommands.ts';
import { decideProcedure } from '../../functions/src/apps/helm/nomos/policy.ts';
import {
  hasProcedureCue,
  hasProcedureReviseCue,
  pickRoute,
} from '../../functions/src/apps/helm/nomos/route.ts';
import { sanitizeScreen } from '../../functions/src/apps/helm/nomos/sanitizeScreen.ts';
import {
  buildProcedureRacedLine,
  describeProcedureChanges,
} from '../../functions/src/apps/helm/nomos/summaries.ts';
import {
  blocksOf,
  type LiveProcedure,
} from '../../functions/src/apps/helm/procedureStore.ts';
import * as deviceLimits from '../../src/apps/helm/constants.ts';

const NOW = 1_000_000;
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

const step = (
  text: string,
  group: string | null = null,
  stepId: string | null = null,
): ModelProcedureStep => ({ stepId, text, detail: null, group });

const rawStep = (
  text: string,
  group: string | null = null,
  stepAlias: string | null = null,
) => ({ stepAlias, text, detail: null, group });

const procedureRow = (over: Record<string, unknown>) => ({
  kind: 'reviseProcedure',
  title: null,
  procedureAlias: 'pr1',
  procedureSteps: [rawStep('Laptop', 'Electronics', 'ps1'), rawStep('Cable')],
  fromTaskAlias: null,
  changeSummary: 'added the cable',
  requestQuote: 'add a step for the cable',
  ...over,
});

const norm = (
  text: string,
  item: Record<string, unknown>,
  over: Record<string, unknown> = {},
) => {
  const procedures = createAliasBook('pr');
  procedures.add('proc-1');
  procedures.add('proc-2');
  const steps = createAliasBook('ps');
  steps.add('step-1');
  const tasks = createAliasBook('t');
  tasks.add('task-1');
  return normalizeNomosReply(
    { commands: [item], mentions: [], places: [] },
    {
      reading,
      aliases: tasks,
      procedures,
      procedureSteps: steps,
      procedureNames: new Map([
        ['proc-1', 'Packing for a work trip'],
        ['proc-2', 'Closing the cabin'],
      ]),
      focusedProcedureId: 'proc-1',
      focusedTaskId: null,
      procedureVersions: new Map([['proc-1', 3]]),
      captureText: text,
      ...over,
    },
  );
};

const revise = (text: string, item: Record<string, unknown> = {}, over = {}) =>
  norm(text, procedureRow(item), over);

const createRow = (over: Record<string, unknown> = {}) => ({
  kind: 'createProcedure',
  title: 'Packing',
  procedureAlias: null,
  procedureSteps: [rawStep('Laptop')],
  fromTaskAlias: null,
  changeSummary: null,
  requestQuote: 'make me a packing routine',
  ...over,
});

// 1. Cues and routing.
assert.ok(hasProcedureCue('Make me a packing routine'));
assert.ok(hasProcedureCue('a CHECKLIST for the move'));
assert.ok(!hasProcedureCue('Buy milk'));
assert.ok(!hasProcedureCue('the routinely late train'));
assert.ok(hasProcedureReviseCue('Add a step for the charger'));
assert.ok(hasProcedureReviseCue('rename the second group'));
assert.ok(!hasProcedureReviseCue('what is on it'));
assert.equal(pickRoute({ text: 'Make me a routine', mode: 'full' }), 'full');
assert.equal(pickRoute({ text: 'Add milk', mode: 'full' }), 'quick');
assert.equal(
  pickRoute({
    text: 'add a step for the charger',
    mode: 'full',
    hasProcedureFocus: true,
  }),
  'full',
);
assert.equal(
  pickRoute({ text: 'add a step for the charger', mode: 'full' }),
  'quick',
);
assert.equal(decideProcedure(), 'automatic');

// 2. A made procedure is kept only when the words ask for one.
const asked = norm('Make me a packing routine', createRow());
assert.equal(asked.procedureCommands.length, 1);
assert.deepEqual(norm('Buy a laptop', createRow()).procedureDropped, [
  'procedure-create-unasked',
]);
assert.deepEqual(
  norm('Make me a routine', createRow({ title: '  ' })).procedureDropped,
  ['procedure-create-empty'],
);
assert.deepEqual(
  norm('Make me a routine', createRow({ procedureSteps: [] })).procedureDropped,
  ['procedure-create-empty'],
);
assert.deepEqual(
  norm(
    'Make me a routine',
    createRow({ procedureSteps: [], fromTaskAlias: 't9' }),
  ).procedureDropped,
  ['procedure-create-task-unknown'],
);
const fromAlias = norm(
  'Make me a routine',
  createRow({ procedureSteps: [], fromTaskAlias: 't1' }),
).procedureCommands[0] as CreateProcedureCommand;
assert.equal(fromAlias.fromTaskId, 'task-1');
const fromFocus = norm(
  'make this a routine',
  createRow({ procedureSteps: [], title: 'Routine' }),
  { focusedTaskId: 'task-1' },
);
assert.equal(
  (fromFocus.procedureCommands[0] as CreateProcedureCommand).fromTaskId,
  'task-1',
);
const long = norm(
  'Make me a packing routine',
  createRow({
    procedureSteps: Array.from({ length: 75 }, (_, i) => rawStep(`Step ${i}`)),
  }),
).procedureCommands[0] as CreateProcedureCommand;
assert.equal(long.steps.length, 60);
assert.equal(long.isTruncated, true);
const trimmed = norm(
  'Make me a packing routine',
  createRow({
    title: 'T'.repeat(200),
    procedureSteps: [
      {
        stepAlias: null,
        text: `  ${'x'.repeat(300)}  `,
        detail: 'd'.repeat(900),
        group: 'G'.repeat(90),
      },
      rawStep('   '),
    ],
  }),
).procedureCommands[0] as CreateProcedureCommand;
assert.ok(trimmed.title.length <= 80);
assert.equal(trimmed.steps.length, 1);
assert.ok(trimmed.steps[0].text.length <= 200);
assert.ok((trimmed.steps[0].detail ?? '').length <= 500);
assert.ok((trimmed.steps[0].group ?? '').length <= 40);

// 3. A revision is kept only on words that ask for it, about a procedure that is open or named and was read.
const kept = revise('Add a step for the cable');
assert.deepEqual(kept.procedureDropped, []);
const keptCommand = kept.procedureCommands[0] as ReviseProcedureCommand;
assert.equal(keptCommand.seenVersion, 3);
assert.equal(keptCommand.steps[0].stepId, 'step-1');
assert.equal(keptCommand.steps[1].stepId, null);
const drops = (text: string, item = {}, over = {}) =>
  revise(text, item, over).procedureDropped;
assert.deepEqual(drops('Add one thing', { requestQuote: 'add' }), [
  'procedure-revise-unasked',
]);
assert.deepEqual(
  drops('Add a step for the cable', {
    requestQuote: 'add a step for the rope',
  }),
  ['procedure-revise-unasked'],
);
assert.deepEqual(
  drops('Look at the cable step', { requestQuote: 'look at the cable' }),
  ['procedure-revise-unasked'],
);
assert.deepEqual(
  drops('Add a step for the cable', {}, { focusedProcedureId: null }),
  ['procedure-revise-unseen'],
);
assert.deepEqual(drops('Add a step for the cable', { procedureAlias: null }), [
  'procedure-revise-unseen',
]);
const named = revise(
  'Add a step for the cable to Closing the cabin',
  { procedureAlias: 'pr2', requestQuote: 'add a step for the cable' },
  {
    focusedProcedureId: null,
    procedureVersions: new Map([['proc-2', 5]]),
  },
);
assert.deepEqual(named.procedureDropped, []);
assert.equal(
  (named.procedureCommands[0] as ReviseProcedureCommand).seenVersion,
  5,
);
assert.deepEqual(
  drops(
    'Add a step for the cable to Closing the cabin',
    { procedureAlias: 'pr2' },
    { focusedProcedureId: null },
  ),
  ['procedure-revise-unseen'],
);
assert.deepEqual(drops('Add a step for the cable', { procedureSteps: [] }), [
  'procedure-revise-empty',
]);
const over = revise('Add a step for the cable', {
  procedureSteps: Array.from({ length: 61 }, (_, i) => rawStep(`S${i}`)),
}).procedureCommands[0] as ReviseProcedureCommand;
assert.equal(over.isOverCap, true);

// 4. Planning.
const packing = norm(
  'Make me a packing routine',
  createRow({
    title: 'Packing for a work trip',
    procedureSteps: [
      rawStep('Weather'),
      ...['Shirts', 'Trousers', 'Shoes', 'Sleepwear', 'Toiletries'].map((t) =>
        rawStep(t, 'Clothes'),
      ),
      ...['Laptop', 'Phone charger', 'Headphones'].map((t) =>
        rawStep(t, 'Electronics'),
      ),
      rawStep('Passport', 'Documents'),
      rawStep('Agenda', 'Documents'),
      rawStep('Hotel'),
    ],
  }),
).procedureCommands[0] as CreateProcedureCommand;
const input = (
  commands: ProcedureCommand[],
  over: Partial<ProcedurePlanInput> = {},
): ProcedurePlanInput => ({
  commands,
  live: new Map(),
  tasks: new Map(),
  captureId: 'cap-1',
  executionId: 'exec-1',
  now: NOW,
  newId,
  seal,
  room: 20,
  ...over,
});
const made = planProcedureCommands(input([packing]));
assert.equal(made.creates.length, 1);
assert.deepEqual(made.lines, [
  'New procedure: Packing for a work trip · 12 steps',
]);
const doc = made.creates[0].doc as {
  version: number;
  stepState: Record<string, { order: number; groupId: string | null }>;
  groupOrder: string[];
  createdBy: string;
  sourceTaskId: string | null;
};
assert.equal(doc.version, 1);
assert.equal(doc.createdBy, 'nomos');
assert.equal(doc.groupOrder.length, 3);
assert.deepEqual(
  Object.values(doc.stepState)
    .map((place) => place.order)
    .sort((a, b) => a - b),
  Array.from({ length: 12 }, (_, i) => i),
);
assert.equal(made.creates[0].version1.reason, 'created');
assert.equal(made.creates[0].version1.version, 1);
assert.deepEqual(made.effects[0].ref, {
  op: 'create',
  collection: 'procedures',
  docId: made.creates[0].id,
});
assert.deepEqual(made.effects[0].effect, {
  written: {
    'sealed.title': 'New procedure: Packing for a work trip · 12 steps',
    'sealed.name': 'Packing for a work trip',
    version: 1,
  },
  previous: null,
});

const fromTask = planProcedureCommands(
  input([{ ...packing, fromTaskId: 'task-1', title: 'Ignored' }], {
    tasks: new Map([
      ['task-1', { title: 'Close the cabin', steps: ['Water off', 'Lock up'] }],
    ]),
  }),
);
const taskDoc = fromTask.creates[0].doc as {
  sourceTaskId: string;
  groupOrder: string[];
};
assert.equal(taskDoc.sourceTaskId, 'task-1');
assert.deepEqual(taskDoc.groupOrder, []);
assert.equal(
  fromTask.effects[0].effect.written['sealed.name'],
  'Close the cabin',
);
assert.deepEqual(fromTask.lines, ['New procedure: Close the cabin · 2 steps']);
const noTask = planProcedureCommands(
  input([{ ...packing, fromTaskId: 'task-1', steps: [] }]),
);
assert.equal(noTask.creates.length, 0);
assert.equal(noTask.notKept.length, 1);
const bigTask = planProcedureCommands(
  input([{ ...packing, fromTaskId: 'task-1', steps: [] }], {
    tasks: new Map([
      [
        'task-1',
        { title: 'Big', steps: Array.from({ length: 70 }, (_, i) => `s${i}`) },
      ],
    ]),
  }),
);
assert.equal(
  Object.keys(bigTask.creates[0].doc.stepState as object).length,
  60,
);
assert.deepEqual(bigTask.notKept, ['Kept the first 60 steps']);
const cut = planProcedureCommands(input([{ ...packing, isTruncated: true }]));
assert.deepEqual(cut.notKept, ['Kept the first 60 steps']);

const liveOf = (): LiveProcedure => {
  const words = made.creates[0];
  const sealed = words.doc.sealed as unknown as {
    title: string;
    steps: LiveProcedure['steps'];
    groups: LiveProcedure['groups'];
  };
  return {
    id: 'proc-1',
    version: 3,
    title: sealed.title,
    steps: sealed.steps,
    groups: sealed.groups,
    stepState: doc.stepState,
    groupOrder: doc.groupOrder,
  };
};
const live = liveOf();
const liveBlocks = blocksOf(live);
const electronics = liveBlocks.find((block) => block.name === 'Electronics');
assert.ok(electronics);
const keptList = liveBlocks.flatMap((block) =>
  block.steps.map((entry) => step(entry.text, block.name, entry.id)),
);
const withCharger = [
  ...keptList.slice(
    0,
    keptList.findIndex((entry) => entry.text === 'Laptop') + 1,
  ),
  step('Laptop charger', 'electronics'),
  ...keptList.slice(keptList.findIndex((entry) => entry.text === 'Laptop') + 1),
];
const reviseCommand = (
  steps: ModelProcedureStep[],
  over: Partial<ReviseProcedureCommand> = {},
): ReviseProcedureCommand => ({
  kind: 'reviseProcedure',
  procedureId: 'proc-1',
  title: null,
  steps,
  changeSummary: 'added the laptop charger',
  requestQuote: 'add a step for the laptop charger',
  seenVersion: 3,
  isOverCap: false,
  ...over,
});
const revised = planProcedureCommands(
  input([reviseCommand(withCharger)], { live: new Map([['proc-1', live]]) }),
);
assert.equal(revised.versions.length, 1);
const version = revised.versions[0];
assert.equal(version.currentVersion, 3);
assert.equal(Object.keys(version.steps).length, 13);
assert.deepEqual(
  Object.keys(live.steps).filter((id) => !(id in version.steps)),
  [],
);
const newIds = Object.keys(version.steps).filter((id) => !(id in live.steps));
assert.equal(newIds.length, 1);
assert.equal(version.steps[newIds[0]].text, 'Laptop charger');
assert.equal(version.stepState[newIds[0]].groupId, electronics.groupId);
assert.deepEqual(version.groupOrder, live.groupOrder);
assert.deepEqual(revised.lines, [
  'Changed Packing for a work trip: added the laptop charger',
]);
assert.deepEqual(revised.effects[0].ref, {
  op: 'update',
  collection: 'procedures',
  docId: 'proc-1',
});
assert.equal(
  (revised.effects[0].effect.previous as { version: number }).version,
  3,
);
assert.equal(revised.effects[0].effect.written.version, 4);
assert.equal(revised.effects[0].effect.written.change, 'revised');
assert.equal(
  revised.effects[0].effect.written['sealed.name'],
  'Packing for a work trip',
);

const raced = planProcedureCommands(
  input([reviseCommand(withCharger, { seenVersion: 2 })], {
    live: new Map([['proc-1', live]]),
  }),
);
assert.equal(raced.retry, true);
assert.equal(raced.versions.length, 0);
assert.deepEqual(raced.notKept, [buildProcedureRacedLine(live.title)]);
assert.equal(
  buildProcedureRacedLine('Packing'),
  'Packing changed while this was made · Ask again',
);
const gone = planProcedureCommands(
  input([reviseCommand(withCharger)], { live: new Map([['proc-1', null]]) }),
);
assert.deepEqual(gone.notKept, ['That procedure is gone']);
const full61 = planProcedureCommands(
  input(
    [
      reviseCommand(
        [
          ...keptList,
          ...Array.from({ length: 49 }, (_, i) => step(`More ${i}`)),
        ],
        { isOverCap: true },
      ),
    ],
    { live: new Map([['proc-1', live]]) },
  ),
);
assert.equal(full61.versions.length, 0);
assert.deepEqual(full61.notKept, [
  'Packing for a work trip can hold 60 steps · Nothing changed',
]);
const same = planProcedureCommands(
  input([reviseCommand(keptList)], { live: new Map([['proc-1', live]]) }),
);
assert.equal(same.versions.length, 0);
assert.deepEqual(same.notKept, [
  'Packing for a work trip is already like that',
]);
const lost = planProcedureCommands(
  input([reviseCommand(keptList.slice(1))], {
    live: new Map([['proc-1', live]]),
  }),
);
assert.equal(lost.versions.length, 0);
assert.equal(lost.notKept.length, 1);
const removed = planProcedureCommands(
  input(
    [
      reviseCommand(keptList.slice(1), {
        requestQuote: 'remove the first step',
      }),
    ],
    { live: new Map([['proc-1', live]]) },
  ),
);
assert.equal(Object.keys(removed.versions[0].steps).length, 11);
const emptied = planProcedureCommands(
  input(
    [
      reviseCommand(
        keptList.filter((entry) => entry.group !== 'Documents'),
        { requestQuote: 'delete the documents' },
      ),
    ],
    { live: new Map([['proc-1', live]]) },
  ),
);
assert.equal(emptied.versions[0].groupOrder.length, 2);
const noRoom = planProcedureCommands(
  input([reviseCommand(withCharger)], {
    live: new Map([['proc-1', live]]),
    room: 0,
  }),
);
assert.equal(noRoom.versions.length, 0);

// 5. The summary of a turn.
assert.equal(describeProcedureChanges(1, 0), 'Made a procedure');
assert.equal(describeProcedureChanges(2, 0), 'Made 2 procedures');
assert.equal(describeProcedureChanges(0, 1), 'Changed a procedure');
assert.equal(
  describeProcedureChanges(1, 1),
  'Made a procedure · Changed a procedure',
);
assert.equal(describeProcedureChanges(0, 0), null);
const written = planWrites({
  commands: [],
  existing: new Map(),
  captureId: 'cap-1',
  executionId: 'exec-1',
  now: NOW,
  seal,
  newId,
  procedureCommands: [packing, reviseCommand(withCharger)],
  liveProcedures: new Map([['proc-1', live]]),
});
assert.equal(written.procedureCreates.length, 1);
assert.equal(written.procedureVersions.length, 1);
assert.deepEqual(
  written.effectRefs.map((ref) => `${ref.op}:${ref.collection}`),
  ['create:procedures', 'update:procedures'],
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
    'Made a procedure · Changed a procedure',
  ),
);

// 6. The emulator's phrases, end to end through the guards and the plan.
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
  focused: ContextFocusedProcedure | null,
  procedures: { id: string; title: string; stepCount: number }[],
) => {
  const context = buildContext({
    text,
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    procedures,
    focusedProcedure: focused,
  });
  const loop = await createFixtureProvider(text, reading).runToolLoop(
    toolRequest(context.message),
  );
  return {
    context,
    reply: normalizeNomosReply(loop.terminalInput, {
      reading,
      aliases: context.aliases,
      procedures: context.procedures,
      procedureSteps: context.procedureSteps,
      procedureNames: new Map(procedures.map((p) => [p.id, p.title])),
      focusedProcedureId: focused?.id ?? null,
      procedureVersions: new Map(
        focused ? [[focused.id, focused.version]] : [],
      ),
      captureText: text,
    }),
  };
};

const createdRun = await runFixture(
  'Make me a packing routine for work trips',
  null,
  [],
);
assert.deepEqual(createdRun.reply.procedureDropped, []);
const createdPlan = planProcedureCommands(
  input(createdRun.reply.procedureCommands),
);
assert.deepEqual(createdPlan.lines, [
  'New procedure: Packing for a work trip · 12 steps',
]);
const createdDoc = createdPlan.creates[0].doc as {
  groupOrder: string[];
  sealed: { groups: Record<string, { name: string }> };
};
assert.deepEqual(
  createdDoc.groupOrder.map((id) => createdDoc.sealed.groups[id].name),
  ['Clothes', 'Electronics', 'Documents'],
);

const openedBlocks = blocksOf(liveOf());
const openProcedure: ContextFocusedProcedure = {
  id: 'proc-1',
  title: live.title,
  version: 3,
  blocks: openedBlocks,
};
const revisedRun = await runFixture(
  'Add a step for the laptop charger',
  openProcedure,
  [{ id: 'proc-1', title: live.title, stepCount: 12 }],
);
assert.deepEqual(revisedRun.reply.procedureDropped, []);
assert.equal(revisedRun.reply.procedureCommands[0]?.kind, 'reviseProcedure');
const revisedPlan = planProcedureCommands(
  input(revisedRun.reply.procedureCommands, {
    live: new Map([['proc-1', live]]),
  }),
);
assert.equal(revisedPlan.versions.length, 1);
assert.equal(Object.keys(revisedPlan.versions[0].steps).length, 13);
const blocksAfter = blocksOf({
  ...live,
  steps: revisedPlan.versions[0].steps,
  groups: revisedPlan.versions[0].groups,
  stepState: revisedPlan.versions[0].stepState,
  groupOrder: revisedPlan.versions[0].groupOrder,
});
const electronicsAfter = blocksAfter.find(
  (block) => block.name === 'Electronics',
);
assert.deepEqual(
  electronicsAfter?.steps.map((entry) => entry.text),
  ['Laptop', 'Laptop charger', 'Phone charger', 'Headphones'],
);

const unopened = await runFixture(
  'Add a step for the laptop charger',
  null,
  [],
);
assert.deepEqual(unopened.reply.procedureDropped, ['procedure-revise-unseen']);
assert.equal(unopened.reply.procedureCommands.length, 0);

// 7. What the context tells the model.
const contextMessage = buildContext({
  text: 'x',
  reading,
  createdAt: NOW,
  timeZone: 'UTC',
  tasks: [],
  procedures: [{ id: 'proc-1', title: 'Packing', stepCount: 12 }],
  focusedProcedure: openProcedure,
}).message;
const readBlock = (tag: string) =>
  JSON.parse(
    contextMessage.match(new RegExp(`<${tag}>(.*)</${tag}>`))?.[1] ?? 'null',
  );
assert.deepEqual(readBlock('your_procedures'), [
  { procedure: 'pr1', title: 'Packing', steps: 12 },
]);
const open = readBlock('procedure_open');
assert.equal(open.procedure, 'pr1');
assert.equal(open.version, 3);
assert.deepEqual(open.groups, ['Clothes', 'Electronics', 'Documents']);
assert.equal(open.steps[0].step, 'ps1');
assert.equal(
  buildContext({
    text: 'x',
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
  }).message.includes('procedure'),
  false,
);

// 8. The screen the person is on.
assert.equal(
  sanitizeScreen({ view: 'procedure', procedureId: 'p1' })?.procedureId,
  'p1',
);
assert.equal(
  sanitizeScreen({ view: 'topic', procedureId: 'p1' })?.procedureId,
  undefined,
);
assert.equal(
  sanitizeScreen({ view: 'procedure', procedureId: 'bad id!' })?.procedureId,
  undefined,
);
assert.equal(sanitizeScreen({ view: 'procedures' })?.view, 'procedures');

// 9. The server's limits are the device's.
const limits = {
  PROCEDURE_STEPS_MAX: 60,
  PROCEDURE_STEP_TEXT_CAP: 200,
  PROCEDURE_STEP_DETAIL_CAP: 500,
  PROCEDURE_TITLE_CAP: 80,
  PROCEDURE_GROUPS_MAX: 12,
  PROCEDURE_GROUP_NAME_CAP: 40,
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

console.log('helm procedures: ok');
