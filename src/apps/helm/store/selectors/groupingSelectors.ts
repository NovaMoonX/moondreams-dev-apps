import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenGrouping } from '@apps/helm/types';

const selectGroupings = (state: RootState) => state.helm.groupings.items;
const selectTasks = (state: RootState) => state.helm.openTasks.items;
const selectProjectTasks = (state: RootState) => state.helm.projectTasks.items;
const selectNotes = (state: RootState) => state.helm.notes.items;
const selectTopics = (state: RootState) => state.helm.topics.items;
const selectProjects = (state: RootState) => state.helm.projects.items;
const selectSynced = (state: RootState) => state.helm.synced.items;

/** Groupings whose readable part opened, newest first. */
export const selectOpenGroupings = createSelector(
  [selectGroupings],
  (groupings): OpenGrouping[] =>
    groupings.filter((grouping) => !grouping.isUnreadable),
);

/** Every source key still there (`<collection>/<id>`), so a deleted thing never counts toward an offer. */
export const selectLiveSourceKeys = createSelector(
  [
    selectTasks,
    selectProjectTasks,
    selectNotes,
    selectTopics,
    selectProjects,
    selectSynced,
  ],
  (tasks, projectTasks, notes, topics, projects, synced): Set<string> =>
    new Set([
      ...[...tasks, ...projectTasks].map((one) => `tasks/${one.id}`),
      ...notes.map((one) => `notes/${one.id}`),
      ...topics.map((one) => `topics/${one.id}`),
      ...projects.map((one) => `projects/${one.id}`),
      ...synced.map((one) => `synced/${one.id}`),
    ]),
);

/** The groupings filed under one project or topic, for its Linked section: answered yes, by the person or quietly. */
export const selectGroupingsUnder = (
  groupings: readonly OpenGrouping[],
  kind: 'project' | 'topic',
  parentId: string,
) =>
  groupings.filter(
    (grouping) =>
      (grouping.state === 'filed' || grouping.state === 'groupedByYou') &&
      grouping.parentKind === kind &&
      grouping.parentId === parentId,
  );
