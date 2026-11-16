import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import type { RootState } from '@/store';
import { isDueOn } from '@/utils/cadenceUtils';
import { readBusyShare, readFreeMinutes } from '@apps/helm/engine/planner';
import type {
  FreeDay,
  GuardrailInput,
  GuardrailTask,
  GuardrailThing,
} from '@apps/helm/engine/guardrails';
import { selectImportanceItems } from '@apps/helm/store/selectors/importanceSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { OpenHabit, OpenProject } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { buildPlanInput } from '@apps/helm/utils/planInput';

type DoneChecks = Record<
  string,
  {
    entries: Record<
      string,
      { checks: Record<string, { status: string; at: number }> }
    >;
  }
>;

export interface GuardrailWorld {
  state: RootState;
  now: number;
  todayKey: string;
  timeZone: string;
  /** The calendar grants; none counts as no calendar connected. */
  grants: ConnectionGrantWithId[];
  /** The habit days read, the last weeks of check-ins. */
  days: DoneChecks;
}

const MINUTE_MS = 60_000;

const checksOf = (habitId: string, days: DoneChecks) =>
  Object.values(days).flatMap((day) =>
    Object.values(day.entries[habitId]?.checks ?? {}).flatMap((check) =>
      check.status === 'done' ? [check.at] : [],
    ),
  );

const openDates = (project: OpenProject) => [
  ...(project.targetDate === null ? [] : [project.targetDate]),
  ...Object.values(project.milestoneState).flatMap((state) =>
    state.doneAt === null && state.date !== null ? [state.date] : [],
  ),
];

const toStepDue = (habits: OpenHabit[]) => (dayKey: string) =>
  habits.some(
    (habit) => habit.status === 'active' && isDueOn(habit.cadence, dayKey),
  );

/** What the guardrails read, from the store as it stands: every project, goal and habit with what has been done on it, the open tasks with their lengths and dates, and a free-time reader built on the planner's own input so it never disagrees with the plan. */
export function buildGuardrailInput(world: GuardrailWorld): GuardrailInput {
  const { state, now, todayKey, timeZone } = world;
  const { helm } = state;
  const projects = new Map(helm.projects.items.map((item) => [item.id, item]));
  const habits = new Map(helm.habits.items.map((item) => [item.id, item]));
  const done = helm.projectTasks.items.filter(
    (task) =>
      !task.isUnreadable && task.status === 'done' && task.completedAt !== null,
  );
  const things = selectImportanceItems(state).map((item): GuardrailThing => {
    const project = projects.get(item.id);
    const habit = habits.get(item.id);
    const own = helm.habits.items.filter(
      (one) => one.projectId === item.id && !one.isUnreadable,
    );
    return {
      ...item,
      createdAt: project?.createdAt ?? habit?.createdAt ?? 0,
      dates: project ? openDates(project) : [],
      isStepDue: item.kind === 'goal' ? toStepDue(own) : null,
      activity: [
        ...(habit ? checksOf(habit.id, world.days) : []),
        ...own.flatMap((one) => checksOf(one.id, world.days)),
        ...done.flatMap((task) =>
          task.projectId === item.id ? [task.completedAt ?? 0] : [],
        ),
        ...(project
          ? Object.values(project.milestoneState).flatMap((entry) =>
              entry.doneAt === null ? [] : [entry.doneAt],
            )
          : []),
      ],
    };
  });
  const awake = new Set(
    selectTaskActivity(
      state,
      Math.floor(now / MINUTE_MS) * MINUTE_MS,
    ).active.map((task) => task.id),
  );
  const tasks = helm.openTasks.items.flatMap((task): GuardrailTask[] =>
    task.isUnreadable
      ? []
      : [
          {
            id: task.id,
            title: task.title,
            projectId: task.projectId,
            dueDay: task.due ? getDueDay(task.due, timeZone) : null,
            minutes: task.durationMinutes,
            isLatent: !awake.has(task.id),
          },
        ],
  );
  const days = new Map<string, FreeDay>();
  const freeDay = (dayKey: string): FreeDay => {
    const known = days.get(dayKey);
    if (known) return known;
    const { profile } = helm;
    const { input } = profile
      ? buildPlanInput(
          {
            profile,
            timeZone,
            now,
            todayKey,
            synced: helm.synced.items,
            grants: world.grants,
            tasks: [],
            places: [],
            planDays: helm.planDays.byId,
            projectPlaces: {},
          },
          dayKey,
        )
      : { input: null };
    const free: FreeDay = input
      ? {
          minutes: readFreeMinutes(input),
          busyShare: readBusyShare(input),
          hasCalendar: input.hasCalendar,
        }
      : { minutes: 0, busyShare: 0, hasCalendar: false };
    days.set(dayKey, free);
    return free;
  };
  return {
    now,
    todayKey,
    isLearningOn: helm.profile?.isLearningOn !== false,
    things,
    tasks,
    freeDay,
  };
}
