import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { FinishedTask } from '@apps/helm/engine/planner';
import type { OpenDayAims } from '@apps/helm/types';
import { readAimTaskIds } from '@apps/helm/utils/dayCard';

const selectDays = (state: RootState) => state.helm.dayAims.byId;

/** One day's aims, or null when the day has none or has not opened. */
export const selectDayAims = (state: RootState, dayKey: string) =>
  selectDays(state)[dayKey] ?? null;

/** Each day's task ids still wanted that day, in the person's order; what the planner puts first. */
export const selectAimTaskIdsByDay = createSelector([selectDays], (days) =>
  Object.fromEntries(
    Object.values(days).map((day: OpenDayAims) => [
      day.id,
      readAimTaskIds(day),
    ]),
  ),
);

/** Finished tasks a length is guessed from: the done tasks the device holds (a project's). */
export const selectFinishedTasks = createSelector(
  [(state: RootState) => state.helm.projectTasks.items],
  (tasks): FinishedTask[] =>
    tasks
      .filter((task) => task.status === 'done' && !task.isUnreadable)
      .map((task) => ({
        projectId: task.projectId,
        context: task.context,
        durationMinutes: task.durationMinutes,
        completedAt: task.completedAt,
      })),
);
