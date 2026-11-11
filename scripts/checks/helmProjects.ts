import assert from 'node:assert/strict';

import { sealForHelm } from '../../functions/src/apps/helm/helmKey.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  planWrites,
  type KnownWhoState,
  type PeopleInput,
  type WritePlan,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import type { ExistingProject } from '../../functions/src/apps/helm/nomos/planProjects.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};
const MARCH_THIRD = Date.UTC(2026, 2, 3);
const DATED: CaptureReading = {
  ...READING,
  dates: [
    {
      id: 'd1',
      text: 'March 3',
      start: 0,
      end: 7,
      due: { kind: 'day', date: MARCH_THIRD },
      precision: null,
    },
  ],
};
const read = (raw: Record<string, unknown>, reading = READING) =>
  normalizeNomosReply(raw, { reading, aliases: createAliasBook('t') });

const task = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: 'createTask',
  ref: null,
  taskAlias: null,
  title,
  dueSpanId: null,
  isUrgent: null,
  ...extra,
});
const project = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: 'createProject',
  title: name,
  projectEmoji: '💍',
  objective: null,
  dueSpanId: null,
  ...extra,
});
const role = (
  projectRef: string,
  whoRefs: string[],
  roleName: 'key' | 'involved',
  roleNote: string | null = null,
) => ({
  kind: 'setProjectRole',
  projectRef,
  whoRefs,
  role: roleName,
  roleNote,
});
const milestone = (
  projectRef: string,
  title: string,
  dueSpanId: string | null = 'd1',
) => ({ kind: 'addMilestone', projectRef, title, dueSpanId });
const mention = (ref: string, name: string) => ({
  ref,
  name,
  kind: 'person',
  relation: null,
  species: null,
  organizationKind: null,
});
const known = (
  id: string,
  name: string,
  extra: Partial<KnownWhoState> = {},
): KnownWhoState => ({
  id,
  kind: 'person',
  name,
  aliases: [],
  lastMentionedAt: null,
  tier: 'passing',
  tierSetBy: 'nomos',
  mentionDayKeys: [],
  taskLinkCount: 0,
  yearlyDateCount: 0,
  momentCount: 0,
  hasRole: false,
  ...extra,
});
const existingProject = (
  id: string,
  name: string,
  whoRoles: ExistingProject['whoRoles'] = {},
  roleNotes: Record<string, string> = {},
  milestoneTitles: Record<string, string> = {},
): ExistingProject => ({
  id,
  name,
  emoji: '💍',
  whoRoles,
  roleNotes,
  milestoneState: Object.fromEntries(
    Object.keys(milestoneTitles).map((key, order) => [
      key,
      { date: null, order, doneAt: null },
    ]),
  ),
  milestoneTitles,
  sealed: {
    name,
    emoji: '💍',
    objective: null,
    milestones: Object.fromEntries(
      Object.entries(milestoneTitles).map(([key, title]) => [key, { title }]),
    ),
    roleNotes,
  },
});

const counter = () => {
  const count = { n: 0 };
  return () => {
    count.n += 1;
    return `new-${count.n}`;
  };
};

const plan = (
  raw: { commands: unknown[]; mentions?: unknown[] },
  options: {
    reading?: CaptureReading;
    projects?: ExistingProject[];
    who?: KnownWhoState[];
  } = {},
): WritePlan => {
  const reply = read(
    { mentions: [], places: [], ...raw },
    options.reading ?? READING,
  );
  const people: PeopleInput = {
    mentions: reply.mentions,
    places: reply.places,
    known: options.who ?? [],
    knownPlaces: [],
    assistantName: null,
    dayKey: '2026-11-10',
    capturedAt: 4000,
  };
  return planWrites({
    commands: reply.commands,
    projectCommands: reply.projects,
    existingProjects: options.projects ?? [],
    existing: new Map(),
    captureId: 'c1',
    executionId: 'e1',
    now: 5000,
    seal,
    newId: counter(),
    people,
  });
};

const dana = mention('$w1', 'Dana');
const refsOf = (result: WritePlan) =>
  result.effectRefs.map((ref) => `${ref.op}:${ref.collection}`);

test('createProject makes one project, and Undo can delete it', () => {
  const result = plan({
    commands: [project('Wedding'), project('Move')],
  });
  assert.equal(result.projectCreates.length, 1);
  assert.deepEqual(refsOf(result), ['create:projects']);
  const [created] = result.projectCreates;
  assert.equal(created.data.status, 'active');
  assert.deepEqual(created.data.milestoneState, {});
  assert.equal(created.data.createdBy, 'nomos');
  assert.equal(result.effects[0].previous, null);
  assert.equal(result.projectsMade, 1);
});

test('a project with the same name as an active one links instead of making a second', () => {
  const result = plan(
    {
      commands: [
        project('wedding'),
        task('Call the florist', { projectRef: 'Wedding' }),
      ],
    },
    { projects: [existingProject('pr1', 'Wedding')] },
  );
  assert.equal(result.projectCreates.length, 0);
  assert.equal(result.creates[0].data.projectId, 'pr1');
});

test('a task points at the project this turn starts', () => {
  const result = plan({
    commands: [
      project('Wedding'),
      task('Book the venue', { projectRef: 'Wedding' }),
    ],
  });
  assert.equal(result.creates[0].data.projectId, result.projectCreates[0].id);
});

test('a sure projectRef links the task, and the who it names becomes involved with an Undo that keeps the earlier roles', () => {
  const result = plan(
    {
      commands: [
        task('Call Dana about flowers', {
          projectRef: 'The wedding',
          whoRefs: ['$w1'],
        }),
      ],
      mentions: [dana],
    },
    {
      projects: [existingProject('pr1', 'Wedding', { other: 'key' })],
      who: [known('w1', 'Dana')],
    },
  );
  assert.equal(result.creates[0].data.projectId, 'pr1');
  const [update] = result.projectUpdates;
  assert.equal(update.id, 'pr1');
  assert.deepEqual(update.data.whoRoles, { other: 'key', w1: 'involved' });
  const effect = result.effects.find((entry) => entry.previous?.whoRoles);
  assert.deepEqual(effect?.previous?.whoRoles, { other: 'key' });
  assert.deepEqual(refsOf(result).sort(), ['create:tasks', 'update:projects']);
});

test('setProjectRole key raises a role and never lowers one', () => {
  const raised = plan(
    {
      commands: [role('Wedding', ['$w1'], 'key', 'florist')],
      mentions: [dana],
    },
    {
      projects: [existingProject('pr1', 'Wedding', { w1: 'involved' })],
      who: [known('w1', 'Dana')],
    },
  );
  assert.deepEqual(raised.projectUpdates[0].data.whoRoles, { w1: 'key' });
  assert.equal(raised.rolesSet, 1);
  const lowered = plan(
    {
      commands: [role('Wedding', ['$w1'], 'involved')],
      mentions: [dana],
    },
    {
      projects: [existingProject('pr1', 'Wedding', { w1: 'key' })],
      who: [known('w1', 'Dana')],
    },
  );
  assert.equal(lowered.projectUpdates.length, 0);
  assert.equal(lowered.rolesSet, 0);
});

test('a passing who given a key role becomes regular, and one the person set stays', () => {
  const commands = [role('Wedding', ['$w1'], 'key')];
  const pool = { projects: [existingProject('pr1', 'Wedding')] };
  const raised = plan(
    { commands, mentions: [dana] },
    { ...pool, who: [known('w1', 'Dana')] },
  );
  assert.equal(
    raised.whoUpdates.find((entry) => entry.id === 'w1')?.data.tier,
    'regular',
  );
  const kept = plan(
    { commands, mentions: [dana] },
    { ...pool, who: [known('w1', 'Dana', { tierSetBy: 'person' })] },
  );
  assert.equal(
    kept.whoUpdates.find((entry) => entry.id === 'w1')?.data.tier,
    undefined,
  );
});

test('an unsure or unknown projectRef links nothing and asks nothing', () => {
  const projects = [
    existingProject('pr1', 'Move to Austin'),
    existingProject('pr2', 'Move to Denver'),
  ];
  const unsure = plan(
    { commands: [task('Pack books', { projectRef: 'Move' })] },
    { projects },
  );
  assert.equal(unsure.creates[0].data.projectId, null);
  assert.equal(unsure.projectUpdates.length, 0);
  assert.equal(unsure.questions.length, 0);
  const none = plan(
    { commands: [task('Pack books', { projectRef: 'Garden' })] },
    { projects },
  );
  assert.equal(none.creates[0].data.projectId, null);
});

test('a who named in a turn that only starts a project is mentioned on it', () => {
  const result = plan(
    {
      commands: [project('Wedding')],
      mentions: [dana],
    },
    { who: [known('w1', 'Dana')] },
  );
  assert.deepEqual(result.projectCreates[0].data.whoRoles, { w1: 'mentioned' });
});

test('a who named beside an existing project but not on its task is not mentioned on it', () => {
  const mom = mention('$w3', 'Mom');
  const result = plan(
    {
      commands: [
        task('Book the quartet', { projectRef: 'Wedding' }),
        task("Buy Mom's cake", { whoRefs: ['$w3'] }),
      ],
      mentions: [mom],
    },
    {
      projects: [existingProject('pr1', 'Wedding')],
      who: [known('w3', 'Mom')],
    },
  );
  assert.equal(result.creates[0].data.projectId, 'pr1');
  assert.equal(result.projectUpdates.length, 0);
});

test('a who named beside a project started with an unrelated task is not mentioned on it', () => {
  const mom = mention('$w3', 'Mom');
  const result = plan(
    {
      commands: [
        project('Wedding'),
        task('Book the quartet', { projectRef: 'Wedding' }),
        task("Buy Mom's cake", { whoRefs: ['$w3'] }),
      ],
      mentions: [mom],
    },
    { who: [known('w3', 'Mom')] },
  );
  assert.deepEqual(result.projectCreates[0].data.whoRoles, {});
});

test('a project whose name is the new one with an article is linked, not made twice', () => {
  const result = plan(
    { commands: [project('The wedding')] },
    { projects: [existingProject('pr1', 'Wedding')] },
  );
  assert.equal(result.projectCreates.length, 0);
});

test('a role asked of a project the person has no active one by that name is not kept', () => {
  const result = plan(
    {
      commands: [role('Move', ['$w1'], 'key')],
      mentions: [dana],
    },
    {
      projects: [existingProject('pr1', 'Wedding')],
      who: [known('w1', 'Dana')],
    },
  );
  assert.equal(result.projectUpdates.length, 0);
  assert.deepEqual(result.notKept, ["Couldn't find a project called Move"]);
});

test('a project started with its people carries the roles in its own document', () => {
  const result = plan(
    {
      commands: [
        project('Wedding'),
        role('Wedding', ['$w1'], 'key', 'florist'),
      ],
      mentions: [dana],
    },
    { who: [known('w1', 'Dana')] },
  );
  assert.equal(result.projectCreates.length, 1);
  assert.equal(result.projectUpdates.length, 0);
  assert.deepEqual(refsOf(result), ['create:projects']);
  assert.deepEqual(result.projectCreates[0].data.whoRoles, { w1: 'key' });
});

test('the reply keeps one project and the roles are capped', () => {
  const reply = read({
    commands: [
      project('Wedding'),
      project('Move'),
      ...Array.from({ length: 7 }, (_, index) =>
        role('Wedding', [`$w${index + 1}`], 'key'),
      ),
    ],
    mentions: Array.from({ length: 7 }, (_, index) =>
      mention(`$w${index + 1}`, `Person ${index + 1}`),
    ),
    places: [],
  });
  const kinds = reply.projects.map((entry) => entry.kind);
  assert.equal(kinds.filter((kind) => kind === 'createProject').length, 1);
  assert.equal(kinds.filter((kind) => kind === 'setProjectRole').length, 5);
});

test('a milestone is added to a project by both maps in one update, with its own effect', () => {
  const result = plan(
    { commands: [milestone('the wedding', 'Venue deposit')] },
    { reading: DATED, projects: [existingProject('pr1', 'Wedding')] },
  );
  assert.equal(result.milestonesAdded, 1);
  const [update] = result.projectUpdates;
  assert.equal(update.id, 'pr1');
  assert.deepEqual(update.data['milestoneState.new-1'], {
    date: MARCH_THIRD,
    order: 0,
    doneAt: null,
  });
  assert.equal(update.data.whoRoles, undefined);
  assert.deepEqual(refsOf(result), ['update:projects']);
  const [effect] = result.effects;
  assert.deepEqual(effect.written['sealed.milestones.new-1'], {
    title: 'Venue deposit',
  });
  assert.equal(effect.previous?.['milestoneState.new-1'], null);
  assert.equal(
    effect.written['sealed.title'],
    'Milestone · Venue deposit · 💍 Wedding · Mar 3',
  );
});

test('a milestone and a role in one turn share one write that keeps both', () => {
  const result = plan(
    {
      commands: [
        role('Wedding', ['$w1'], 'key', 'florist'),
        milestone('Wedding', 'Venue deposit', null),
      ],
      mentions: [dana],
    },
    {
      who: [known('w1', 'Dana')],
      projects: [
        existingProject('pr1', 'Wedding', {}, {}, { m0: 'Venue booked' }),
      ],
    },
  );
  assert.equal(result.projectUpdates.length, 1);
  const [update] = result.projectUpdates;
  assert.deepEqual(update.data.whoRoles, { w1: 'key' });
  assert.equal(update.data['milestoneState.new-1'] !== undefined, true);
  assert.equal(
    (update.data['milestoneState.new-1'] as { order: number }).order,
    1,
  );
  assert.equal(result.effects.length, 2);
  assert.equal(
    result.effects[1].written['milestoneState.new-1'] !== undefined,
    true,
  );
});

test('a milestone with a title the project already has is not added again', () => {
  const result = plan(
    {
      commands: [
        milestone('Wedding', 'venue booked!'),
        milestone('Wedding', 'Final guest list'),
        milestone('Wedding', 'Final Guest List'),
      ],
    },
    {
      reading: DATED,
      projects: [
        existingProject('pr1', 'Wedding', {}, {}, { m0: 'Venue booked' }),
      ],
    },
  );
  assert.equal(result.milestonesAdded, 1);
  assert.equal(result.projectUpdates.length, 1);
  const added = Object.keys(result.projectUpdates[0].data).filter((key) =>
    key.startsWith('milestoneState.'),
  );
  assert.equal(added.length, 1);
  assert.deepEqual(
    result.effects[0].written[
      `sealed.milestones.${added[0].slice('milestoneState.'.length)}`
    ],
    {
      title: 'Final guest list',
    },
  );
});

test('a milestone for a project the person has none of is kept out and reported', () => {
  const result = plan(
    { commands: [milestone('Move', 'Book movers')] },
    { projects: [existingProject('pr1', 'Wedding')] },
  );
  assert.equal(result.projectUpdates.length, 0);
  assert.equal(result.milestonesAdded, 0);
  assert.deepEqual(result.notKept, ["Couldn't find a project called Move"]);
});

test('a milestone for the project this turn starts is written with it', () => {
  const result = plan(
    {
      commands: [project('Wedding'), milestone('Wedding', 'Venue booked')],
    },
    { reading: DATED },
  );
  assert.equal(result.milestonesAdded, 1);
  const [created] = result.projectCreates;
  assert.equal(Object.keys(created.data.milestoneState as object).length, 1);
  assert.deepEqual(refsOf(result), ['create:projects', 'update:projects']);
});

test('a project holds thirty milestones and says so when a thirty-first is asked', () => {
  const titles = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`m${index}`, `Step ${index}`]),
  );
  const result = plan(
    { commands: [milestone('Wedding', 'One more')] },
    { projects: [existingProject('pr1', 'Wedding', {}, {}, titles)] },
  );
  assert.equal(result.milestonesAdded, 0);
  assert.equal(result.projectUpdates.length, 0);
  assert.deepEqual(result.notKept, ['💍 Wedding already holds 30 milestones']);
});

test('a reply keeps three milestones, cuts the title and reads the date from its span', () => {
  const reply = read(
    {
      commands: [
        ...Array.from({ length: 5 }, (_, index) =>
          milestone('Wedding', `Step ${index}`),
        ),
        milestone('Wedding', 'x'.repeat(120)),
        milestone('', 'No project'),
        milestone('Wedding', ''),
      ],
      mentions: [],
      places: [],
    },
    DATED,
  );
  const milestones = reply.projects.flatMap((entry) =>
    entry.kind === 'addMilestone' ? [entry] : [],
  );
  assert.equal(milestones.length, 3);
  assert.equal(milestones[0].date, MARCH_THIRD);
  const long = read(
    {
      commands: [milestone('Wedding', 'x'.repeat(120), null)],
      mentions: [],
      places: [],
    },
    DATED,
  );
  const [only] = long.projects.flatMap((entry) =>
    entry.kind === 'addMilestone' ? [entry] : [],
  );
  assert.equal(only.title.length, 80);
  assert.equal(only.date, null);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
