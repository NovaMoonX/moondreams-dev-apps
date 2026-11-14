import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { NameRecord } from '@apps/helm/utils/spokenNames';

const readable = <T extends { isUnreadable: boolean; name: string }>(
  items: readonly T[],
) => items.filter((item) => !item.isUnreadable && item.name.trim() !== '');

/** The people, pets, organizations, places and projects a heard or typed word can be read as, private ones too: it is read on the device and only the id is sealed. */
export const selectNameRecords = createSelector(
  [
    (state: RootState) => state.helm.who.items,
    (state: RootState) => state.helm.places.items,
    (state: RootState) => state.helm.projects.items,
  ],
  (who, places, projects): NameRecord[] => [
    ...readable(who).map((entry) => ({
      id: entry.id,
      name: entry.name,
      aliases: entry.aliases,
      soundsLike: entry.soundsLike ?? [],
    })),
    ...readable(places).map((entry) => ({
      id: entry.id,
      name: entry.name,
      aliases: entry.aliases,
      soundsLike: [],
    })),
    ...readable(projects).map((entry) => ({
      id: entry.id,
      name: entry.name,
      aliases: [],
      soundsLike: [],
    })),
  ],
);
