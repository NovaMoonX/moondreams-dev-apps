import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { SEEN_AS_KINDS, type SeenAsKind } from '@apps/helm/engine/seenAs';
import type { OpenSeenAs } from '@apps/helm/store/listeners/seenAsListener';

const selectLines = (state: RootState) => state.helm.seenAs.items;
const selectForgottenAt = (state: RootState) =>
  state.helm.profile?.forgottenAt ?? null;

/** The lines the page shows: not removed, not without words, and not what Forget hid before its clean-up deletes it. */
export const selectShownSeenAs = createSelector(
  [selectLines, selectForgottenAt],
  (lines, forgottenAt): OpenSeenAs[] =>
    lines.filter(
      (one) =>
        one.state !== 'removed' &&
        !one.isUnreadable &&
        (one.corrected ?? one.line) !== '' &&
        (forgottenAt === null || one.createdAt > forgottenAt),
    ),
);

export interface SeenAsGroup {
  kind: SeenAsKind;
  lines: OpenSeenAs[];
}

/** The shown lines by kind in the page's order, the person's own words first and then newest; a kind with none is left out. */
export const selectSeenAsGroups = createSelector(
  [selectShownSeenAs],
  (lines): SeenAsGroup[] =>
    SEEN_AS_KINDS.map((kind) => ({
      kind,
      lines: lines
        .filter((one) => one.kind === kind)
        .sort(
          (a, b) =>
            Number(b.state === 'corrected') - Number(a.state === 'corrected') ||
            (b.correctedAt ?? b.derivedAt) - (a.correctedAt ?? a.derivedAt) ||
            a.id.localeCompare(b.id),
        ),
    })).filter((group) => group.lines.length > 0),
);
