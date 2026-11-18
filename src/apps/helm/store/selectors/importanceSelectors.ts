import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  nearestDate,
  readImportanceOrder,
  readUnderGoalIds,
  readProjectPlaces,
  type ImportanceItem,
  type OrderRow,
} from '@apps/helm/engine/importance';
import type { OpenHabit, OpenProject } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';

const selectProjects = (state: RootState) => state.helm.projects.items;
const selectHabits = (state: RootState) => state.helm.habits.items;
const selectOpenTasks = (state: RootState) => state.helm.openTasks.items;
const selectZone = (state: RootState) =>
  state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
const selectToday = (_state: RootState, today: number) => today;

/** Each project's open tasks' due days (overdue ones by their due day), date-only. Sleeping tasks are read too, since the selector holds no clock. */
const selectTaskDays = createSelector(
  [selectOpenTasks, selectZone],
  (tasks, timeZone) =>
    tasks.reduce<Map<string, number[]>>((days, task) => {
      if (task.isUnreadable || !task.projectId || !task.due) return days;
      return days.set(task.projectId, [
        ...(days.get(task.projectId) ?? []),
        getDueDay(task.due, timeZone),
      ]);
    }, new Map()),
);

const isCareMark = (mark: string | null) =>
  mark === 'health' || mark === 'care';

const toProjectItem = (
  project: OpenProject,
  taskDays: ReadonlyMap<string, number[]>,
): ImportanceItem => ({
  id: project.id,
  kind: project.kind,
  name: project.name,
  place: project.importance,
  goalId: null,
  isCare: isCareMark(project.privateMark),
  status:
    project.status === 'finished'
      ? 'out'
      : project.status === 'paused'
        ? 'paused'
        : 'running',
  date: nearestDate([
    project.targetDate,
    ...(taskDays.get(project.id) ?? []),
    ...Object.values(project.milestoneState).map((state) =>
      state.doneAt === null ? state.date : null,
    ),
  ]),
});

const toHabitItem = (habit: OpenHabit): ImportanceItem => ({
  id: habit.id,
  kind: 'habit',
  name: habit.name,
  place: habit.importance,
  goalId: habit.projectId,
  isCare: habit.isCare || isCareMark(habit.privateMark),
  status:
    habit.status === 'active'
      ? 'running'
      : habit.status === 'paused'
        ? 'paused'
        : 'out',
  date: null,
});

/** Every readable project, goal and habit as the order reads them; one that won't open can't be moved, so it stays out. */
export const selectImportanceItems = createSelector(
  [selectProjects, selectHabits, selectTaskDays],
  (projects, habits, taskDays): ImportanceItem[] => [
    ...projects
      .filter((project) => !project.isUnreadable)
      .map((project) => toProjectItem(project, taskDays)),
    ...habits.filter((habit) => !habit.isUnreadable).map(toHabitItem),
  ],
);

/** The order on a day (`today` is date-only). */
export const selectImportanceOrder = createSelector(
  [selectImportanceItems, selectToday],
  readImportanceOrder,
);

export interface ImportanceRowView extends OrderRow {
  name: string;
  emoji: string | null;
}

const emojiOf = (projects: OpenProject[], habits: OpenHabit[], row: OrderRow) =>
  (row.kind === 'habit'
    ? habits.find((habit) => habit.id === row.id)?.emoji
    : projects.find((project) => project.id === row.id)?.emoji) ?? null;

/** What the view draws: the three groups with each row's kind, name and emoji, and how many health and care things the order leaves out ("Always kept"). */
export const selectImportanceGroups = createSelector(
  [selectImportanceOrder, selectImportanceItems, selectProjects, selectHabits],
  (order, items, projects, habits) => {
    const names = new Map(items.map((item) => [item.id, item.name]));
    const view = (row: OrderRow): ImportanceRowView => ({
      ...row,
      name: names.get(row.id) ?? '',
      emoji: emojiOf(projects, habits, row),
    });
    return {
      underGoalIds: readUnderGoalIds(items),
      inOrder: order.inOrder.map(view),
      notSaid: order.notSaid.map(view),
      canWait: order.canWait.map(view),
      alwaysKept: order.alwaysKept.map((id) => ({
        id,
        name: names.get(id) ?? '',
        kind: items.find((item) => item.id === id)?.kind ?? 'habit',
      })),
    };
  },
);

export const selectAlwaysKeptCount = (state: RootState, today: number) =>
  selectImportanceOrder(state, today).alwaysKept.length;

/** One thing's row, or null when it is not in the order (finished, health or care, unreadable). */
export const selectImportanceRow = (
  state: RootState,
  today: number,
  id: string,
) =>
  selectImportanceOrder(state, today).rows.find((row) => row.id === id) ?? null;

/** Each placed project's place number, which the planner breaks ties by. */
export const selectProjectPlaces = createSelector(
  [selectImportanceOrder],
  readProjectPlaces,
);
