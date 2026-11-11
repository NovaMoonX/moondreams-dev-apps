import type { SealedPayload } from '../../../appKeys/seal.js';
import type { LiveProcedure } from '../procedureStore.js';
import type { LiveRun } from '../runStore.js';
import { flattenSteps, groupSteps } from '../stepGroups.js';
import { getLocalDay } from '../syncedCopies.js';
import {
  RUN_STEPS_MAX,
  type RunCommand,
  type StartRunCommand,
  type TickRunCommand,
} from './commands.js';
import type { PlannedEffect } from './planTopicCommands.js';
import { matchProject, type ProjectPoolEntry } from './planProjects.js';
import {
  buildProjectNotFoundLine,
  buildProcedureGoneLine,
  buildRunAlreadyTickedLine,
  buildRunExistsLine,
  buildRunGoneLine,
  buildRunNoStepsLine,
  buildRunRoomLine,
  buildRunStartedLine,
  buildRunTickedLine,
} from './summaries.js';

export interface PlannedRunCreate {
  id: string;
  doc: Record<string, unknown>;
}

export interface PlannedRunTick {
  runId: string;
  stepIds: string[];
}

export interface RunPlan {
  creates: PlannedRunCreate[];
  ticks: PlannedRunTick[];
  effects: PlannedEffect[];
  /** The result line of each run started or ticked. */
  lines: string[];
  notKept: string[];
}

export interface RunPlanInput {
  commands: RunCommand[];
  /** The procedures the start commands name, opened as the transaction read them; null when gone. */
  liveProcedures: ReadonlyMap<string, LiveProcedure | null>;
  /** The runs the tick commands name, opened as the transaction read them; null when gone. */
  liveRuns: ReadonlyMap<string, LiveRun | null>;
  /** Every run not yet finished, for the already-running check. */
  openRuns: readonly LiveRun[];
  /** The active projects a run may be for. */
  projects: ProjectPoolEntry[];
  timeZone: string;
  captureId: string;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
}

const EMPTY_PLAN: RunPlan = {
  creates: [],
  ticks: [],
  effects: [],
  lines: [],
  notKept: [],
};

const withPlan = (plan: RunPlan, next: Partial<RunPlan>): RunPlan => ({
  ...plan,
  ...next,
});

interface Target {
  attachedTo: { kind: 'project' | 'synced'; id: string } | null;
  label: string | null;
  dueOn: number | null;
}

/** What the run is for: the synced copy named, else the project the words surely mean; null when a named project is unknown. */
const resolveTarget = (
  command: StartRunCommand,
  input: RunPlanInput,
): Target | null => {
  if (command.about) {
    const { about } = command;
    return {
      attachedTo: { kind: 'synced', id: about.id },
      label: about.title,
      dueOn:
        about.startAt === null
          ? null
          : about.isAllDay
            ? about.startAt
            : getLocalDay(about.startAt, input.timeZone),
    };
  }
  if (command.projectRef === null) {
    return { attachedTo: null, label: null, dueOn: null };
  }
  const id = matchProject(command.projectRef, input.projects);
  const project = input.projects.find((entry) => entry.id === id);
  return project
    ? {
        attachedTo: { kind: 'project', id: project.id },
        label: project.name,
        dueOn: null,
      }
    : null;
};

const isSameTarget = (
  left: Target['attachedTo'],
  right: Target['attachedTo'],
) =>
  left === null || right === null
    ? left === right
    : left.kind === right.kind && left.id === right.id;

const planStart = (
  plan: RunPlan,
  command: StartRunCommand,
  input: RunPlanInput,
): RunPlan => {
  const live = input.liveProcedures.get(command.procedureId) ?? null;
  if (!live) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildProcedureGoneLine()],
    });
  }
  const target = resolveTarget(command, input);
  if (!target) {
    return withPlan(plan, {
      notKept: [
        ...plan.notKept,
        buildProjectNotFoundLine(command.projectRef ?? ''),
      ],
    });
  }
  const isRunning =
    input.openRuns.some(
      (run) =>
        run.finishedAt === null &&
        run.procedureId === live.id &&
        isSameTarget(run.attachedTo, target.attachedTo),
    ) ||
    plan.creates.some(
      (made) =>
        made.doc.procedureId === live.id &&
        isSameTarget(
          made.doc.attachedTo as Target['attachedTo'],
          target.attachedTo,
        ),
    );
  if (isRunning) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildRunExistsLine(live.title, target.label)],
    });
  }
  const rows = flattenSteps(groupSteps(live)).slice(0, RUN_STEPS_MAX);
  if (rows.length === 0) {
    return withPlan(plan, {
      notKept: [...plan.notKept, buildRunNoStepsLine(live.title)],
    });
  }
  if (input.room < 1) {
    return withPlan(plan, { notKept: [...plan.notKept, buildRunRoomLine()] });
  }
  const groupOrder = [
    ...new Set(rows.flatMap((row) => (row.groupId ? [row.groupId] : []))),
  ];
  const id = input.newId();
  const line = buildRunStartedLine(live.title, target.label);
  return withPlan(plan, {
    creates: [
      ...plan.creates,
      {
        id,
        doc: {
          procedureId: live.id,
          procedureVersion: live.version,
          attachedTo: target.attachedTo,
          dueOn: target.dueOn,
          stepState: Object.fromEntries(
            rows.map((row, index) => [
              row.id,
              {
                order: index,
                groupId: row.groupId,
                doneAt: null,
                isExtra: false,
              },
            ]),
          ),
          groupOrder,
          startedAt: input.now,
          finishedAt: null,
          createdBy: 'nomos',
          executionId: input.executionId,
          lastEditedAt: null,
          sealed: input.seal({
            title: live.title,
            steps: Object.fromEntries(
              rows.map((row) => [
                row.id,
                { text: row.text, detail: row.detail },
              ]),
            ),
            groups: Object.fromEntries(
              groupOrder.map((groupId) => [
                groupId,
                { name: live.groups[groupId]?.name ?? '' },
              ]),
            ),
            attachedLabel: target.label,
          }),
        },
      },
    ],
    effects: [
      ...plan.effects,
      {
        ref: { op: 'create', collection: 'procedureRuns', docId: id },
        effect: {
          written: { 'sealed.title': line, 'sealed.name': live.title },
          previous: null,
        },
      },
    ],
    lines: [...plan.lines, line],
  });
};

/** The steps each run is asked to tick, in the order first named, a step named twice once. */
const toTickRequests = (commands: TickRunCommand[]) => [
  ...commands
    .flatMap((command) => command.steps)
    .reduce(
      (byRun, { runId, stepId }) =>
        byRun.set(runId, [...new Set([...(byRun.get(runId) ?? []), stepId])]),
      new Map<string, string[]>(),
    ),
];

const planTicks = (
  plan: RunPlan,
  commands: TickRunCommand[],
  input: RunPlanInput,
): RunPlan =>
  toTickRequests(commands).reduce((acc, [runId, stepIds]) => {
    const live = input.liveRuns.get(runId) ?? null;
    if (!live || live.finishedAt !== null) {
      return withPlan(acc, { notKept: [...acc.notKept, buildRunGoneLine()] });
    }
    const fresh = stepIds.filter(
      (stepId) => live.stepState[stepId]?.doneAt === null,
    );
    if (fresh.length === 0) {
      return withPlan(acc, {
        notKept: [...acc.notKept, buildRunAlreadyTickedLine()],
      });
    }
    if (input.room - acc.effects.length < 1) {
      return withPlan(acc, {
        notKept: [...acc.notKept, buildRunRoomLine()],
      });
    }
    const line = buildRunTickedLine(
      live.title,
      fresh.length,
      live.steps[fresh[0]]?.text ?? '',
    );
    return withPlan(acc, {
      ticks: [...acc.ticks, { runId, stepIds: fresh }],
      effects: [
        ...acc.effects,
        {
          ref: { op: 'update', collection: 'procedureRuns', docId: runId },
          effect: {
            written: {
              ...Object.fromEntries(
                fresh.map((stepId) => [
                  `stepState.${stepId}.doneAt`,
                  input.now,
                ]),
              ),
              'sealed.title': line,
            },
            previous: {
              ...Object.fromEntries(
                fresh.map((stepId) => [`stepState.${stepId}.doneAt`, null]),
              ),
              'sealed.title': line,
            },
          },
        },
      ],
      lines: [...acc.lines, line],
    });
  }, plan);

/** Settles the turn's run commands against what the transaction read: a run starts once for a procedure and what it is for, only a step not yet done is ticked, and a finished or missing run is never touched. Pure. */
export function planRunCommands(input: RunPlanInput): RunPlan {
  const started = input.commands
    .filter(
      (command): command is StartRunCommand => command.kind === 'startRun',
    )
    .reduce<RunPlan>(
      (plan, command) =>
        planStart(plan, command, {
          ...input,
          room: input.room - plan.effects.length,
        }),
      EMPTY_PLAN,
    );
  return planTicks(
    started,
    input.commands.filter(
      (command): command is TickRunCommand => command.kind === 'tickRun',
    ),
    input,
  );
}
