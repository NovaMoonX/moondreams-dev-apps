import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { isShownConnection } from '@apps/helm/engine/connections';

const selectConnections = (state: RootState) => state.helm.connections.items;

/** What a screen draws: no refused proposal and no document that would not open. */
export const selectShownConnections = createSelector(
  [selectConnections],
  (connections) =>
    connections.filter(
      (connection) => isShownConnection(connection) && !connection.isUnreadable,
    ),
);
