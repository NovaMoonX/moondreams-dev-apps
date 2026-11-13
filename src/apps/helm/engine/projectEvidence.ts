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

/** A short line built only from what the project's tasks and milestones show: what is overdue, the next deadline (a milestone or a dated task),  how long it has been quiet, what a key person still has open. Never a percentage, a bar or a grade. */
export function selectProjectEvidence(input: {
  project: Pick<
    OpenProject,
    | 'id'
    | 'whoRoles'
    | 'roleNotes'
    | 'createdAt'
    | 'milestoneState'
    | 'milestones'
  >;
  tasks: Pick<
    OpenTask,
    'projectId' | 'status' | 'due' | 'whoIds' | 'completedAt' | 'title'
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
  const today = getDueDay({ kind: 'moment', at: now }, timeZone);
  const overdue = open.filter(
    (task) => task.due !== null && isOverdue(task.due, timeZone, now),
  ).length;
  const milestoneDeadlines = Object.entries(project.milestoneState).flatMap(
    ([id, state]) => {
      const words = project.milestones[id];
      return words && state.doneAt === null && state.date !== null
        ? [{ title: words.title, day: state.date }]
        : [];
    },
  );
  // A milestone whose day has passed is shown in its tab only; it is neither overdue nor next.
  const nextDue = [
    ...milestoneDeadlines.filter((entry) => entry.day >= today),
    ...open.flatMap((task) =>
      task.due !== null && !isOverdue(task.due, timeZone, now)
        ? [{ title: task.title, day: getDueDay(task.due, timeZone) }]
        : [],
    ),
  ].sort((left, right) => left.day - right.day)[0];
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
    (today - getDueDay({ kind: 'moment', at: lastActive }, timeZone)) / DAY_MS,
  );
  const isQuiet = open.length > 0 && quietDays >= PROJECT_QUIET_DAYS;
  const parts: EvidencePart[] = [
    ...(overdue > 0
      ? [{ text: HELM_COPY.projectOverdue(overdue), tone: 'warning' as const }]
      : []),
    ...(nextDue
      ? [
          {
            text: HELM_COPY.projectNextDue(
              nextDue.title,
              Math.round((nextDue.day - today) / DAY_MS),
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
  ].slice(0, 2);
  const fallback =
    tasks.length === 0
      ? HELM_COPY.projectNoTasks
      : open.some((task) => task.due !== null)
        ? HELM_COPY.projectOnTrack
        : HELM_COPY.projectOpenNoDates(open.length);
  return {
    parts: parts.length > 0 ? parts : [{ text: fallback, tone: 'muted' }],
    canFinish: false,
  };
}
