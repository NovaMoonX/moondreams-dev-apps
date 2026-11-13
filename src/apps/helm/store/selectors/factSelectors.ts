import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenFact } from '@apps/helm/types';

const selectFacts = (state: RootState) => state.helm.facts.items;
const selectSelfWhoId = (state: RootState) => state.helm.profile?.selfWhoId;

/** What is kept about the person themself: open preferences, favorites and identity facts on their own who, in the listener's newest-first order. */
export const selectSelfFacts = createSelector(
  [selectFacts, selectSelfWhoId],
  (facts, selfWhoId): OpenFact[] =>
    selfWhoId
      ? facts.filter(
          (fact) =>
            fact.status !== 'superseded' &&
            fact.kind !== 'world' &&
            fact.whoIds.includes(selfWhoId),
        )
      : [],
);
