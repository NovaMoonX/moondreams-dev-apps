import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenPlace, OpenWho } from '@apps/helm/types';

const selectWho = (state: RootState) => state.helm.who.items;
const selectPlaces = (state: RootState) => state.helm.places.items;

export const selectWhoById = createSelector(
  [selectWho],
  (who): Map<string, OpenWho> => new Map(who.map((entry) => [entry.id, entry])),
);

export const selectPlacesById = createSelector(
  [selectPlaces],
  (places): Map<string, OpenPlace> =>
    new Map(places.map((entry) => [entry.id, entry])),
);
