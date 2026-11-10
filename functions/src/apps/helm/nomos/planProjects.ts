import type { SealedPayload } from '../../../appKeys/seal.js';
import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import type {
  CreateProjectCommand,
  SetProjectRoleCommand,
} from './commands.js';
import { buildProjectNotFoundLine, buildRoleLine } from './summaries.js';

export type ProjectRoleName = 'key' | 'involved' | 'mentioned';

const RANK: Record<ProjectRoleName, number> = {
  mentioned: 1,
  involved: 2,
  key: 3,
};

/** An active project the person already has, its words opened. */
export interface ExistingProject {
  id: string;
  name: string;
  emoji: string | null;
  whoRoles: Record<string, ProjectRoleName>;
  roleNotes: Record<string, string>;
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

/** Turns the roles a turn asks for into the project documents to write: roles only rise (mentioned, involved, key), a note is set only when said, and a project made in the same turn carries its roles from the start. */
export function planProjectRoles(input: {
  created: CreatedProject | null;
  existing: ExistingProject[];
  pool: ProjectPoolEntry[];
  commands: SetProjectRoleCommand[];
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
    return {
      id,
      data: {
        targetDate: command.targetDate,
        status: 'active',
        milestoneState: {},
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
          milestones: {},
          roleNotes,
        }),
      },
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
    if (raised.length === 0) return [];
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
    return [
      {
        id: project.id,
        count: raised.filter((entry) => entry.role !== 'mentioned').length,
        data: {
          whoRoles,
          ...(hasNotes && {
            sealed: input.seal({ ...project.sealed, roleNotes }),
          }),
          lastEditedAt: input.now,
        },
        effect: {
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
              ...(hasNotes && { 'sealed.roleNotes': project.roleNotes }),
              'sealed.title': label,
            },
          },
        },
      },
    ];
  });

  return {
    creates: createdWrites
      ? [{ id: createdWrites.id, data: createdWrites.data }]
      : [],
    updates: changes.map(({ id, data }) => ({ id, data })),
    effects: [
      ...(createdWrites ? [createdWrites.effect] : []),
      ...changes.map((change) => change.effect),
    ],
    roleWhoIds,
    notKept: [
      ...new Set(
        matched.flatMap(({ command, projectId }) =>
          projectId ? [] : [buildProjectNotFoundLine(command.projectRef)],
        ),
      ),
    ],
    rolesSet: changes.reduce((total, change) => total + change.count, 0),
  };
}
