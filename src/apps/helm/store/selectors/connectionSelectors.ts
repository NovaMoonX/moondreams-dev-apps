import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  inferFamilyLinks,
  isShownConnection,
  type InferredLink,
} from '@apps/helm/engine/connections';
import { isPrivateRead } from '@apps/helm/utils/privacy';

const selectConnections = (state: RootState) => state.helm.connections.items;
const selectPeople = (state: RootState) => state.helm.who.items;
const selectSelfWhoId = (state: RootState) =>
  state.helm.profile?.selfWhoId ?? null;

/** No refused proposal and no document that would not open. */
export const selectShownConnections = createSelector(
  [selectConnections],
  (connections) =>
    connections.filter(
      (connection) => isShownConnection(connection) && !connection.isUnreadable,
    ),
);

/** The links worked out from what is stored, under both people's ids; refusals and unreadable documents count as decided. */
export const selectFiguredOutByWho = createSelector(
  [selectPeople, selectConnections, selectSelfWhoId],
  (people, connections, selfId) =>
    inferFamilyLinks({
      selfId,
      people: people.map((who) => ({
        id: who.id,
        kin: who.isUnreadable ? null : (who.kin ?? null),
        isPrivate: isPrivateRead(who),
        isPerson: who.kind === 'person' && !who.isUnreadable,
      })),
      connections,
    }).reduce(
      (byWho, link) =>
        [link.firstId, link.secondId].reduce(
          (map, id) => map.set(id, [...(map.get(id) ?? []), link]),
          byWho,
        ),
      new Map<string, InferredLink[]>(),
    ),
);
