import type { SealedPayload } from '../../../appKeys/seal.js';
import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { LiveProcedure, ProcedureWords } from '../procedureStore.js';
import {
  flattenSteps,
  groupSteps,
  toStepState,
  type StepPlace,
} from '../stepGroups.js';
import {
  PROCEDURE_GROUPS_MAX,
  PROCEDURE_STEP_TEXT_CAP,
  PROCEDURE_STEPS_MAX,
  PROCEDURE_SUMMARY_CAP,
  PROCEDURE_TITLE_CAP,
  type CreateProcedureCommand,
  type ModelProcedureStep,
  type ProcedureCommand,
  type ReviseProcedureCommand,
} from './commands.js';
import type { PlannedEffect } from './planTopicCommands.js';
import {
  buildProcedureChangedLine,
  buildProcedureExistsLine,
  buildProcedureGroupsLine,
  buildProcedureRoomLine,
  buildProcedureFullLine,
  buildProcedureGoneLine,
  buildProcedureLostLine,
  buildProcedureMadeLine,
  buildProcedureNoStepsLine,
  buildProcedureRacedLine,
  buildProcedureTruncatedLine,
  buildProcedureUnchangedLine,
} from './summaries.js';

export interface PlannedProcedureCreate {
  id: string;
  doc: Record<string, unknown>;
  version1: Record<string, unknown>;
}

export interface PlannedProcedureVersion extends ProcedureWords {
  procedureId: string;
  currentVersion: number;
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  changeSummary: string;
  requestQuote: string | null;
  sourceCaptureId: string | null;
  executionId: string;
}

export interface ProcedurePlan {
  creates: PlannedProcedureCreate[];
  versions: PlannedProcedureVersion[];
  effects: PlannedEffect[];
  /** The result line of each procedure made or changed. */
  lines: string[];
  notKept: string[];
}

export interface ProcedureTask {
  title: string;
  steps: string[];
}

export interface ProcedurePlanInput {
  commands: ProcedureCommand[];
  live: ReadonlyMap<string, LiveProcedure | null>;
  tasks: ReadonlyMap<string, ProcedureTask | null>;
  captureId: string;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
}

const EMPTY_PLAN: ProcedurePlan = {
  creates: [],
  versions: [],
  effects: [],
  lines: [],
  notKept: [],
};

const REMOVAL_CUES = new Set([
  'remove',
  'delete',
  'drop',
  'cut',
  'merge',
  'shorter',
  'shorten',
  'trim',
  'tidy',
  'simplify',
  'rewrite',
]);

type Layout = Omit<ProcedureWords, 'title'> & {
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  /** Names of groups past the cap, whose steps went ungrouped. */
  overflow: string[];
};

const toKey = (name: string) => name.trim().toLowerCase();

interface Row {
  id: string;
  text: string;
  detail: string | null;
  groupId: string | null;
}

/** Ids, groups and order for a list of steps; a step that names one already there keeps its id, a group matched by name keeps its id and a group nothing uses is gone. */
const layoutSteps = (
  list: ModelProcedureStep[],
  live: LiveProcedure | null,
  newId: () => string,
): Layout => {
  const knownGroups = new Map(
    Object.entries(live?.groups ?? {}).map(([id, group]) => [
      toKey(group.name),
      { id, name: group.name },
    ]),
  );
  const built = list.reduce<{
    used: Set<string>;
    groups: Map<string, { id: string; name: string }>;
    rows: Row[];
    overflow: string[];
  }>(
    (acc, step) => {
      const key = step.group === null ? null : toKey(step.group);
      const known = key === null ? null : (acc.groups.get(key) ?? null);
      const isOver =
        key !== null && !known && acc.groups.size >= PROCEDURE_GROUPS_MAX;
      const group =
        key === null || known
          ? known
          : isOver
            ? null
            : (knownGroups.get(key) ?? { id: newId(), name: step.group ?? '' });
      const isKept =
        step.stepId !== null &&
        !!live &&
        step.stepId in live.steps &&
        !acc.used.has(step.stepId);
      const id = isKept && step.stepId ? step.stepId : newId();
      return {
        used: new Set([...acc.used, id]),
        overflow:
          isOver && step.group && !acc.overflow.includes(step.group)
            ? [...acc.overflow, step.group]
            : acc.overflow,
        groups:
          group && key !== null
            ? new Map(acc.groups).set(key, group)
            : acc.groups,
        rows: [
          ...acc.rows,
          {
            id,
            text: step.text,
            detail:
              step.detail === ''
                ? null
                : (step.detail ??
                  (isKept && live ? (live.steps[id]?.detail ?? null) : null)),
            groupId: group?.id ?? null,
          },
        ],
      };
    },
    { used: new Set(), groups: new Map(), rows: [], overflow: [] },
  );
  const groups = [...built.groups.values()];
  return {
    overflow: built.overflow,
    stepState: toStepState(built.rows),
    groupOrder: groups.map((group) => group.id),
    steps: Object.fromEntries(
      built.rows.map((row) => [row.id, { text: row.text, detail: row.detail }]),
    ),
    groups: Object.fromEntries(
      groups.map((group) => [group.id, { name: group.name }]),
    ),
  };
};

const signature = (title: string, words: Omit<Layout, 'overflow'>) =>
  JSON.stringify([
    title,
    words.groupOrder.map((id) => words.groups[id]?.name ?? null),
    flattenSteps(groupSteps(words)).map((step) => [
      step.text,
      step.detail,
      step.groupId === null ? null : (words.groups[step.groupId]?.name ?? null),
    ]),
  ]);

const withPlan = (
  plan: ProcedurePlan,
  next: Partial<ProcedurePlan>,
): ProcedurePlan => ({ ...plan, ...next });

/** The effect the device's Undo reads: a made procedure is deleted, a revision goes back to the version before it. */
const revisedEffect = (
  procedureId: string,
  version: number,
  line: string,
  name: string,
  previousName: string,
): PlannedEffect => ({
  ref: { op: 'update', collection: 'procedures', docId: procedureId },
  effect: {
    written: {
      version: version + 1,
      change: 'revised',
      'sealed.title': line,
      'sealed.name': name,
    },
    previous: { version, 'sealed.title': line, 'sealed.name': previousName },
  },
});

const planCreate = (
  plan: ProcedurePlan,
  command: CreateProcedureCommand,
  input: ProcedurePlanInput,
): ProcedurePlan => {
  const task = command.fromTaskId
    ? (input.tasks.get(command.fromTaskId) ?? null)
    : null;
  const source: ModelProcedureStep[] = command.fromTaskId
    ? (task?.steps ?? []).map((text) => ({
        stepId: null,
        text: text.slice(0, PROCEDURE_STEP_TEXT_CAP),
        detail: null,
        group: null,
      }))
    : command.steps;
  if (source.length === 0) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureNoStepsLine()],
    });
  }
  if (input.room < 1) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureRoomLine()],
    });
  }
  const isCut =
    command.isTruncated ||
    (command.fromTaskId !== null && source.length > PROCEDURE_STEPS_MAX);
  const title = (task?.title || command.title).slice(0, PROCEDURE_TITLE_CAP);
  const laid = layoutSteps(
    source.slice(0, PROCEDURE_STEPS_MAX),
    null,
    input.newId,
  );
  const id = input.newId();
  const count = Object.keys(laid.steps).length;
  const line = buildProcedureMadeLine(title, count);
  const words = { title, steps: laid.steps, groups: laid.groups };
  return withPlan(plan, {
    creates: [
      ...plan.creates,
      {
        id,
        doc: {
          stepState: laid.stepState,
          groupOrder: laid.groupOrder,
          version: 1,
          createdBy: 'nomos',
          sourceCaptureId: input.captureId,
          sourceTaskId: command.fromTaskId,
          executionId: input.executionId,
          createdAt: input.now,
          lastEditedAt: null,
          sealed: input.seal(words),
        },
        version1: {
          version: 1,
          restoredFromVersion: null,
          createdBy: 'nomos',
          reason: 'created',
          stepState: laid.stepState,
          groupOrder: laid.groupOrder,
          sourceCaptureId: input.captureId,
          executionId: input.executionId,
          createdAt: input.now,
          sealed: input.seal({
            ...words,
            changeSummary: `Made with ${count} steps`,
            requestQuote:
              command.requestQuote === '' ? null : command.requestQuote,
          }),
        },
      },
    ],
    effects: [
      ...plan.effects,
      {
        ref: { op: 'create', collection: 'procedures', docId: id },
        effect: {
          written: { 'sealed.title': line, 'sealed.name': title, version: 1 },
          previous: null,
        },
      },
    ],
    lines: [...plan.lines, line],
    notKept: [
      ...plan.notKept,
      ...(isCut ? [buildProcedureTruncatedLine(PROCEDURE_STEPS_MAX)] : []),
      ...laid.overflow.map((name) =>
        buildProcedureGroupsLine(name, PROCEDURE_GROUPS_MAX),
      ),
    ],
  });
};

const planRevise = (
  plan: ProcedurePlan,
  command: ReviseProcedureCommand,
  input: ProcedurePlanInput,
): ProcedurePlan => {
  const live = input.live.get(command.procedureId) ?? null;
  if (!live) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureGoneLine()],
    });
  }
  if (live.version !== command.seenVersion) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureRacedLine(live.title)],
    });
  }
  const laid = layoutSteps(command.steps, live, input.newId);
  if (
    command.isOverCap ||
    Object.keys(laid.steps).length > PROCEDURE_STEPS_MAX
  ) {
    return withPlan(plan, {
      notKept: [
        ...plan.notKept,
        buildProcedureFullLine(live.title, PROCEDURE_STEPS_MAX),
      ],
    });
  }
  const title = command.title ?? live.title;
  const keptIds = new Set(Object.keys(laid.steps));
  const isRemoval = toComparable(command.requestQuote)
    .split(' ')
    .some((word) => REMOVAL_CUES.has(word));
  if (
    !isRemoval &&
    flattenSteps(groupSteps(live)).some((step) => !keptIds.has(step.id))
  ) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureLostLine(live.title)],
    });
  }
  if (signature(title, laid) === signature(live.title, live)) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureUnchangedLine(live.title)],
    });
  }
  if (input.room < 1) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureRoomLine()],
    });
  }
  const summary = command.changeSummary.slice(0, PROCEDURE_SUMMARY_CAP);
  const line = buildProcedureChangedLine(title, summary);
  return withPlan(plan, {
    versions: [
      ...plan.versions,
      {
        procedureId: live.id,
        currentVersion: live.version,
        title,
        steps: laid.steps,
        groups: laid.groups,
        stepState: laid.stepState,
        groupOrder: laid.groupOrder,
        changeSummary: summary === '' ? 'Changed as asked' : summary,
        requestQuote: command.requestQuote === '' ? null : command.requestQuote,
        sourceCaptureId: input.captureId,
        executionId: input.executionId,
      },
    ],
    effects: [
      ...plan.effects,
      revisedEffect(live.id, live.version, line, title, live.title),
    ],
    lines: [...plan.lines, line],
    notKept: [
      ...plan.notKept,
      ...laid.overflow.map((name) =>
        buildProcedureGroupsLine(name, PROCEDURE_GROUPS_MAX),
      ),
    ],
  });
};

/** Settles the turn's procedure commands against what the transaction read: a made procedure is cut at the step cap, a revision is refused over it, on a stale version, or when it would lose steps nobody asked to remove. Pure. */
export function planProcedureCommands(
  input: ProcedurePlanInput,
): ProcedurePlan {
  return input.commands.reduce<ProcedurePlan>((plan, command) => {
    const room = input.room - plan.effects.length;
    const step = { ...input, room };
    if (command.kind === 'procedureExists') {
      return withPlan(plan, {
        notKept: [...plan.notKept, buildProcedureExistsLine(command.title)],
      });
    }
    return command.kind === 'createProcedure'
      ? planCreate(plan, command, step)
      : planRevise(plan, command, step);
  }, EMPTY_PLAN);
}
