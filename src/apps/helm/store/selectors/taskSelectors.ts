import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { splitByActivity } from '@apps/helm/engine/activation';

const selectOpenTasks = (state: RootState) => state.helm.openTasks.items;
const selectZone = (state: RootState) =>
  state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
const selectNowMinute = (_state: RootState, nowMinute: number) => nowMinute;

/** The open tasks split by whether they are awake; `nowMinute` is the clock floored to a minute so the result holds between ticks. */
export const selectTaskActivity = createSelector(
  [selectOpenTasks, selectZone, selectNowMinute],
  (tasks, timeZone, nowMinute) =>
    splitByActivity(tasks, { now: nowMinute, timeZone }),
);

export const selectActiveTasks = (state: RootState, nowMinute: number) =>
  selectTaskActivity(state, nowMinute).active;
