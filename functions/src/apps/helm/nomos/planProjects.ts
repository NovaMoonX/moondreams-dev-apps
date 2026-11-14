import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  createOptionMatcher,
  toComparable,
} from '../../../vendor/optionMatchUtils.js';
import {
  MAX_MILESTONES_PER_PROJECT,
  type AddMilestoneCommand,
  type CreateProjectCommand,
  type SetProjectRoleCommand,
} from './commands.js';
import {
  buildMilestoneLine,
  buildMilestonesFullLine,
  buildProjectNotFoundLine,
  buildRoleLine,
} from './summaries.js';

export type ProjectRoleName = 'key' | 'involved' | 'mentioned';

const RANK: Record<ProjectRoleName, number> = {
  mentioned: 1,
  involved: 2,
  key: 3,
};

export interface ExistingMilestoneState {
  date: number | null;
  order: number;
  doneAt: number | null;
}

/** An active project the person already has, its words opened. */
export interface ExistingProject {
  id: string;
  name: string;
  emoji: string | null;
  whoRoles: Record<string, ProjectRoleName>;
  roleNotes: Record<string, string>;
  milestoneState: Record<string, ExistingMilestoneState>;
  /** Milestone titles by id; an id with no state, or a state with no title, is not a milestone. */
  milestoneTitles: Record<string, string>;
  isPrivate?: boolean;
  sealed: Record<string, unknown>;
}

export interface ProjectPoolEntry {
  id: string;
  name: string;
}

const matcher = createOptionMatcher<ProjectPoolEntry>({
  names: (project) => [project.name],
  prepare: (text) => text.replace(/^\s*the\s+/i, ''),
});

/** The project a name surely means, or null: an unsure name links nothing. */
export const matchProject = (name: string, pool: ProjectPoolEntry[]) =>
  matcher.match(name, pool)?.id ?? null;

interface Effect {
  ref: { op: 'create' | 'update'; collection: 'projects'; docId: string };
  effect: {
    written: Record<string, unknown>;
    previous: Record<string, unknown> | null;
  };
}

export interface CreatedProject {
  id: string;
  command: CreateProjectCommand;
}

/** The projects a task may point at: the active ones, plus the one this turn starts; a project the new one's name surely means is linked, not made twice. */
export function settleProjectStart(input: {
  command: CreateProjectCommand | null;
  existing: ExistingProject[];
  newId: () => string;
}): { created: CreatedProject | null; pool: ProjectPoolEntry[] } {
  const pool = input.existing.map(({ id, name }) => ({ id, name }));
  const { command } = input;
  if (!command) return { created: null, pool };
  if (matchProject(command.name, pool)) return { created: null, pool };
  const id = input.newId();
  return {
    created: { id, command },
    pool: [...pool, { id, name: command.name }],
  };
}

interface Request {
  role: ProjectRoleName;
  note: string | null;
}

const toLabel = (emoji: string | null, name: string) =>
  [emoji, name].filter(Boolean).join(' ');

interface NewMilestone {
  id: string;
  title: string;
  date: number | null;
  order: number;
}

const toMilestoneState = (milestone: NewMilestone) => ({
  date: milestone.date,
  order: milestone.order,
  doneAt: null,
});

/** Turns the roles and milestones a turn asks for into the project documents to write: roles only rise (mentioned, involved, key), a note is set only when said, a milestone is added only when the project has no one by that title and room for another, and a project made in the same turn carries both from the start. One write per project holds roles and milestones together, each milestone with its own effect so Undo can leave one that changed. */
export function planProjectRoles(input: {
  created: CreatedProject | null;
  existing: ExistingProject[];
  pool: ProjectPoolEntry[];
  commands: SetProjectRoleCommand[];
  milestones: AddMilestoneCommand[];
  newId: () => string;
  /** The who each task of the turn names, by the project it is filed in. */
  taskWho: { projectId: string | null; whoIds: string[] }[];
  /** Every who the capture names that is settled, the person's own excluded. */
  namedWhoIds: string[];
  whoIdOf: Map<string, string>;
  nameOf: Map<string, string>;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  effects: Effect[];
  roleWhoIds: Set<string>;
  rolesSet: number;
  milestonesAdded: number;
  notKept: string[];
} {
  const add = (
    requests: Map<string, Map<string, Request>>,
    projectId: string,
    whoId: string,
    request: Request,
  ) => {
    const forProject = requests.get(projectId) ?? new Map<string, Request>();
    const current = forProject.get(whoId);
    const role =
      current && RANK[current.role] > RANK[request.role]
        ? current.role
        : request.role;
    forProject.set(whoId, {
      role,
      note: request.note ?? current?.note ?? null,
    });
    requests.set(projectId, forProject);
  };
  const matched = input.commands.map((command) => ({
    command,
    projectId: matchProject(command.projectRef, input.pool),
  }));
  const askedMilestones = input.milestones.map((command) => ({
    command,
    projectId: matchProject(command.projectRef, input.pool),
  }));
  const labelOf = (projectId: string) => {
    const project = input.existing.find((entry) => entry.id === projectId);
    const made = input.created?.id === projectId ? input.created.command : null;
    return toLabel(
      project?.emoji ?? made?.emoji ?? null,
      project?.name ?? made?.name ?? '',
    );
  };
  const addedMilestones = askedMilestones.reduce(
    (all, { command, projectId }) => {
      if (!projectId) return all;
      const project = input.existing.find((entry) => entry.id === projectId);
      const current = all.get(projectId) ?? { added: [], isFull: false };
      const states = Object.values(project?.milestoneState ?? {});
      const isDuplicate = [
        ...Object.values(project?.milestoneTitles ?? {}),
        ...current.added.map((entry) => entry.title),
      ].some((title) => toComparable(title) === toComparable(command.title));
      const isRoomLeft =
        states.length + current.added.length < MAX_MILESTONES_PER_PROJECT;
      if (isDuplicate) return all.set(projectId, current);
      if (!isRoomLeft) return all.set(projectId, { ...current, isFull: true });
      return all.set(projectId, {
        ...current,
        added: [
          ...current.added,
          {
            id: input.newId(),
            title: command.title,
            date: command.date,
            order:
              Math.max(-1, ...states.map((state) => state.order)) +
              1 +
              current.added.length,
          },
        ],
      });
    },
    new Map<string, { added: NewMilestone[]; isFull: boolean }>(),
  );
  const milestoneEffect = (projectId: string, milestone: NewMilestone) => {
    const line = buildMilestoneLine({
      title: milestone.title,
      project: labelOf(projectId),
      date: milestone.date,
    });
    return {
      ref: {
        op: 'update' as const,
        collection: 'projects' as const,
        docId: projectId,
      },
      effect: {
        written: {
          [`milestoneState.${milestone.id}`]: toMilestoneState(milestone),
          [`sealed.milestones.${milestone.id}`]: { title: milestone.title },
          'sealed.title': line,
        },
        previous: {
          [`milestoneState.${milestone.id}`]: null,
          [`sealed.milestones.${milestone.id}`]: null,
          'sealed.title': line,
        },
      },
    };
  };
  const said = matched.flatMap(({ command, projectId }) =>
    projectId
      ? [
          ...new Set(
            command.whoRefs.flatMap((ref) => input.whoIdOf.get(ref) ?? []),
          ),
        ].map((whoId) => ({
          projectId,
          whoId,
          role: command.role,
          note: command.note,
        }))
      : [],
  );
  const involved = input.taskWho.flatMap(({ projectId, whoIds }) =>
    projectId
      ? whoIds.map((whoId) => ({
          projectId,
          whoId,
          role: 'involved' as const,
          note: null,
        }))
      : [],
  );
  const strong = [...said, ...involved].reduce((requests, entry) => {
    add(requests, entry.projectId, entry.whoId, entry);
    return requests;
  }, new Map<string, Map<string, Request>>());
  const startedId = input.created?.id ?? null;
  const isStartedAlone = input.taskWho.every(
    (entry) => entry.projectId === startedId,
  );
  const requests =
    startedId && isStartedAlone
      ? input.namedWhoIds.reduce((all, whoId) => {
          add(all, startedId, whoId, { role: 'mentioned', note: null });
          return all;
        }, strong)
      : strong;
  const roleWhoIds = new Set(
    [...said, ...involved].map((entry) => entry.whoId),
  );
  const nameOf = (whoId: string) => input.nameOf.get(whoId) ?? '';
  const rolesOf = (projectId: string) => [
    ...(requests.get(projectId) ?? new Map<string, Request>()).entries(),
  ];

  const writeCreated = ({ id, command }: CreatedProject) => {
    const entries = rolesOf(id);
    const whoRoles = Object.fromEntries(
      entries.map(([whoId, request]) => [whoId, request.role]),
    );
    const roleNotes = Object.fromEntries(
      entries.flatMap(([whoId, request]) =>
        request.note ? [[whoId, request.note]] : [],
      ),
    );
    const added = addedMilestones.get(id)?.added ?? [];
    return {
      id,
      data: {
        targetDate: command.targetDate,
        status: 'active',
        milestoneState: Object.fromEntries(
          added.map((entry) => [entry.id, toMilestoneState(entry)]),
        ),
        whoRoles,
        mediaIds: [],
        createdBy: 'nomos',
        executionId: input.executionId,
        createdAt: input.now,
        lastEditedAt: null,
        finishedAt: null,
        sealed: input.seal({
          name: command.name,
          emoji: command.emoji,
          objective: command.objective,
          milestones: Object.fromEntries(
            added.map((entry) => [entry.id, { title: entry.title }]),
          ),
          roleNotes,
        }),
      },
      milestoneEffects: added.map((entry) => milestoneEffect(id, entry)),
      effect: {
        ref: {
          op: 'create' as const,
          collection: 'projects' as const,
          docId: id,
        },
        effect: {
          written: {
            'sealed.name': command.name,
            'sealed.emoji': command.emoji,
            status: 'active',
            whoRoles,
            'sealed.roleNotes': roleNotes,
          },
          previous: null,
        },
      },
    };
  };
  const createdWrites = input.created ? writeCreated(input.created) : null;

  const changes = input.existing.flatMap((project) => {
    const entries = rolesOf(project.id);
    const added = addedMilestones.get(project.id)?.added ?? [];
    const raised = entries.flatMap(([whoId, request]) => {
      const current = project.whoRoles[whoId];
      const role =
        current && RANK[current] >= RANK[request.role] ? current : request.role;
      const note =
        request.note && request.note !== project.roleNotes[whoId]
          ? request.note
          : null;
      return role !== current || note !== null
        ? [{ whoId, role, note, isNew: role !== current }]
        : [];
    });
    if (raised.length === 0 && added.length === 0) return [];
    const whoRoles = {
      ...project.whoRoles,
      ...Object.fromEntries(raised.map((entry) => [entry.whoId, entry.role])),
    };
    const roleNotes = {
      ...project.roleNotes,
      ...Object.fromEntries(
        raised.flatMap((entry) =>
          entry.note ? [[entry.whoId, entry.note]] : [],
        ),
      ),
    };
    const hasNotes = raised.some((entry) => entry.note !== null);
    const hasStrong = raised.some((entry) => entry.role !== 'mentioned');
    const shown = raised.filter(
      (entry) => !hasStrong || entry.role !== 'mentioned',
    );
    const label = buildRoleLine({
      names: shown.map((entry) => nameOf(entry.whoId)).filter(Boolean),
      role: shown.some((entry) => entry.role === 'key')
        ? 'key'
        : hasStrong
          ? 'involved'
          : 'mentioned',
      project: toLabel(project.emoji, project.name),
    });
    const heldMilestones =
      typeof project.sealed.milestones === 'object' &&
      project.sealed.milestones !== null
        ? (project.sealed.milestones as Record<string, unknown>)
        : {};
    const isResealed = hasNotes || added.length > 0;
    return [
      {
        id: project.id,
        count: raised.filter((entry) => entry.role !== 'mentioned').length,
        added: added.length,
        data: {
          ...(raised.length > 0 && { whoRoles }),
          ...(isResealed && {
            sealed: input.seal({
              ...project.sealed,
              ...(hasNotes && { roleNotes }),
              ...(added.length > 0 && {
                milestones: {
                  ...heldMilestones,
                  ...Object.fromEntries(
                    added.map((entry) => [entry.id, { title: entry.title }]),
                  ),
                },
              }),
            }),
          }),
          ...Object.fromEntries(
            added.map((entry) => [
              `milestoneState.${entry.id}`,
              toMilestoneState(entry),
            ]),
          ),
          lastEditedAt: input.now,
        },
        effects: [
          ...(raised.length > 0
            ? [
                {
                  ref: {
                    op: 'update' as const,
                    collection: 'projects' as const,
                    docId: project.id,
                  },
                  effect: {
                    written: {
                      whoRoles,
                      ...(hasNotes && { 'sealed.roleNotes': roleNotes }),
                      'sealed.title': label,
                    },
                    previous: {
                      whoRoles: project.whoRoles,
                      ...(hasNotes && {
                        'sealed.roleNotes': project.roleNotes,
                      }),
                      'sealed.title': label,
                    },
                  },
                },
              ]
            : []),
          ...added.map((entry) => milestoneEffect(project.id, entry)),
        ],
      },
    ];
  });

  return {
    creates: createdWrites
      ? [{ id: createdWrites.id, data: createdWrites.data }]
      : [],
    updates: changes.map(({ id, data }) => ({ id, data })),
    effects: [
      ...(createdWrites
        ? [createdWrites.effect, ...createdWrites.milestoneEffects]
        : []),
      ...changes.flatMap((change) => change.effects),
    ],
    roleWhoIds,
    notKept: [
      ...new Set([
        ...matched.flatMap(({ command, projectId }) =>
          projectId ? [] : [buildProjectNotFoundLine(command.projectRef)],
        ),
        ...askedMilestones.flatMap(({ command, projectId }) =>
          projectId ? [] : [buildProjectNotFoundLine(command.projectRef)],
        ),
        ...[...addedMilestones.entries()].flatMap(([projectId, entry]) =>
          entry.isFull
            ? [
                buildMilestonesFullLine(
                  labelOf(projectId),
                  MAX_MILESTONES_PER_PROJECT,
                ),
              ]
            : [],
        ),
      ]),
    ],
    rolesSet: changes.reduce((total, change) => total + change.count, 0),
    milestonesAdded:
      changes.reduce((total, change) => total + change.added, 0) +
      (createdWrites?.milestoneEffects.length ?? 0),
  };
}
