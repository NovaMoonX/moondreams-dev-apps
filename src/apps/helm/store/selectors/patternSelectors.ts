import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { patternFamily } from '@apps/helm/engine/patterns';
import type {
  OpenObservation,
  OpenPattern,
  OpenReflection,
  PatternBucket,
} from '@apps/helm/types';

const selectForgottenAt = (state: RootState) =>
  state.helm.profile?.forgottenAt ?? null;
const selectPatterns = (state: RootState) => state.helm.patterns.items;
const selectObservations = (state: RootState) => state.helm.observations.items;
const selectReflections = (state: RootState) =>
  state.helm.unseenReflections.items;

const isKept = (forgottenAt: number | null, createdAt: number) =>
  forgottenAt === null || createdAt > forgottenAt;

/** What Forget hid is left out of every read, before the clean-up deletes it. */
export const selectShownPatterns = createSelector(
  [selectPatterns, selectForgottenAt],
  (patterns, forgottenAt): OpenPattern[] =>
    patterns.filter(
      (pattern) =>
        !pattern.isUnreadable && isKept(forgottenAt, pattern.createdAt),
    ),
);

export const selectShownObservations = createSelector(
  [selectObservations, selectForgottenAt],
  (observations, forgottenAt): OpenObservation[] =>
    observations.filter((one) => isKept(forgottenAt, one.createdAt)),
);

export const selectShownReflections = createSelector(
  [selectReflections, selectForgottenAt],
  (reflections, forgottenAt): OpenReflection[] =>
    reflections.filter((one) => isKept(forgottenAt, one.createdAt)),
);

export interface NoticedRow {
  pattern: OpenPattern;
  /** False for one the person said no to or took back, which waits under Not used. */
  isUsed: boolean;
}

const STATE_ORDER: Record<OpenPattern['state'], number> = {
  accepted: 0,
  suggested: 1,
  candidate: 2,
  declined: 3,
  undone: 4,
  retired: 5,
};

/** What Helm has noticed, accepted first and then asked, then not yet asked, then what was said no to; never a habit-life or guardrail pattern. */
export const selectNoticedRows = createSelector(
  [selectShownPatterns],
  (patterns): NoticedRow[] =>
    patterns
      .filter(
        (pattern) =>
          patternFamily(pattern.kind) === 'noticed' && pattern.statement !== '',
      )
      .sort(
        (a, b) =>
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          b.stateAt - a.stateAt ||
          a.id.localeCompare(b.id),
      )
      .map((pattern) => ({
        pattern,
        isUsed: STATE_ORDER[pattern.state] <= STATE_ORDER.candidate,
      })),
);

const isOffer = (pattern: OpenPattern) =>
  pattern.state === 'suggested' && pattern.handling !== 'actAndTell';

const offerOrder = (a: OpenPattern, b: OpenPattern) =>
  Number(b.handling === 'askOnly') - Number(a.handling === 'askOnly') ||
  b.stateAt - a.stateAt ||
  a.id.localeCompare(b.id);

/** The one offer Today shows: a person-set thing's pattern Helm asked about, care first, then the newest. */
export const selectTodayOffer = createSelector(
  [selectNoticedRows],
  (rows): OpenPattern | null =>
    rows
      .map((row) => row.pattern)
      .filter(isOffer)
      .sort(offerOrder)[0] ?? null,
);

/** The offer waiting on one habit's page. */
export const selectHabitOffer = createSelector(
  [selectNoticedRows, (_state: RootState, habitId: string) => habitId],
  (rows, habitId): OpenPattern | null =>
    rows
      .map((row) => row.pattern)
      .filter(
        (pattern) =>
          isOffer(pattern) &&
          pattern.subject.collection === 'habits' &&
          pattern.subject.id === habitId,
      )
      .sort(offerOrder)[0] ?? null,
);

/** What Helm did on its own that the person has not taken back: accepted by itself, newest first. */
export const selectActedPatterns = createSelector(
  [selectNoticedRows],
  (rows): OpenPattern[] =>
    rows
      .map((row) => row.pattern)
      .filter(
        (pattern) =>
          pattern.state === 'accepted' &&
          pattern.acceptedBy === 'auto' &&
          pattern.undoneByExecutionId === null,
      )
      .sort((a, b) => b.stateAt - a.stateAt),
);

export type AvoidBucket = Extract<PatternBucket, { kind: 'weekdayPart' }>;

/** The day-parts the planner leaves empty: accepted `plannerAvoid` patterns, whoever accepted them. */
export const selectAvoidBuckets = createSelector(
  [selectShownPatterns],
  (patterns): AvoidBucket[] =>
    patterns.flatMap((pattern) =>
      pattern.state === 'accepted' &&
      pattern.effect.kind === 'plannerAvoid' &&
      pattern.effect.bucket.kind === 'weekdayPart'
        ? [pattern.effect.bucket]
        : [],
    ),
);
