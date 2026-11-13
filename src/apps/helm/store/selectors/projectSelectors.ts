import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenProject } from '@apps/helm/types';

const selectProjects = (state: RootState) => state.helm.projects.items;

const readable = (projects: OpenProject[]) =>
  projects.filter((project) => !project.isUnreadable);

/** Active projects, the most recently touched first. */
export const selectActiveProjects = createSelector(
  [selectProjects],
  (projects) =>
    readable(projects)
      .filter((project) => project.status === 'active')
      .sort(
        (left, right) =>
          (right.lastEditedAt ?? right.createdAt) -
          (left.lastEditedAt ?? left.createdAt),
      ),
);

/** Finished projects, the latest finished first. */
export const selectFinishedProjects = createSelector(
  [selectProjects],
  (projects) =>
    readable(projects)
      .filter((project) => project.status === 'finished')
      .sort((left, right) => (right.finishedAt ?? 0) - (left.finishedAt ?? 0)),
);

export const selectProjectById = createSelector(
  [selectProjects],
  (projects): Map<string, OpenProject> =>
    new Map(projects.map((project) => [project.id, project])),
);

export const selectHasProjects = (state: RootState) =>
  state.helm.projects.items.length > 0;
