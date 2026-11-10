import { DAY_MS, HELM_COPY, PROJECT_QUIET_DAYS } from '@apps/helm/constants';
import type { OpenProject, OpenTask } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { isOverdue } from '@apps/helm/utils/taskDue';

export interface EvidencePart {
  text: string;
  /** Only an overdue count is warning-coloured; everything else is muted. */
  tone: 'warning' | 'muted';
}

export interface ProjectEvidence {
  parts: EvidencePart[];
  /** Every task is done, so the line offers to finish the project. */
  canFinish: boolean;
}

/** A short line built only from what the project's tasks show: what is overdue, what a key person still has open, how long it has been quiet. Never a percentage, a bar or a grade. */
export function selectProjectEvidence(input: {
  project: Pick<OpenProject, 'id' | 'whoRoles' | 'roleNotes' | 'createdAt'>;
  tasks: Pick<
    OpenTask,
    'projectId' | 'status' | 'due' | 'whoIds' | 'completedAt'
  >[];
  /** Names of the people the project has roles for, by id. */
  whoNames: Map<string, string>;
  now: number;
  timeZone: string;
}): ProjectEvidence {
  const { project, whoNames, now, timeZone } = input;
  const tasks = input.tasks.filter((task) => task.projectId === project.id);
  const open = tasks.filter((task) => task.status === 'open');
  if (tasks.length > 0 && open.length === 0) {
    return {
      parts: [{ text: HELM_COPY.projectAllDone, tone: 'muted' }],
      canFinish: true,
    };
  }
  const overdue = open.filter(
    (task) => task.due !== null && isOverdue(task.due, timeZone, now),
  ).length;
  const keyOpen = Object.entries(project.whoRoles)
    .flatMap(([whoId, role]) => {
      const name = whoNames.get(whoId);
      const count = open.filter((task) => task.whoIds.includes(whoId)).length;
      return role === 'key' && name && count > 0
        ? [{ name, note: project.roleNotes[whoId] ?? null, count }]
        : [];
    })
    .sort((left, right) => right.count - left.count)[0];
  const lastActive = Math.max(
    project.createdAt,
    ...tasks.map((task) => task.completedAt ?? 0),
  );
  const quietDays = Math.round(
    (getDueDay({ kind: 'moment', at: now }, timeZone) -
      getDueDay({ kind: 'moment', at: lastActive }, timeZone)) /
      DAY_MS,
  );
  const isQuiet = open.length > 0 && quietDays >= PROJECT_QUIET_DAYS;
  const parts: EvidencePart[] = [
    ...(overdue > 0
      ? [{ text: HELM_COPY.projectOverdue(overdue), tone: 'warning' as const }]
      : []),
    ...(keyOpen
      ? [
          {
            text: HELM_COPY.projectKeyOpen(
              keyOpen.name,
              keyOpen.note,
              keyOpen.count,
            ),
            tone: 'muted' as const,
          },
        ]
      : []),
    ...(isQuiet
      ? [
          {
            text: HELM_COPY.projectQuiet(quietDays, open.length),
            tone: 'muted' as const,
          },
        ]
      : []),
  ].slice(0, 2);
  return {
    parts:
      parts.length > 0
        ? parts
        : [{ text: HELM_COPY.projectOnTrack, tone: 'muted' }],
    canFinish: false,
  };
}
