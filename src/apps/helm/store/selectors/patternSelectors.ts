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

/** Whether Helm may use what it noticed: a profile before the switch counts as on. */
export const selectIsLearningOn = (state: RootState) =>
  state.helm.profile?.isLearningOn !== false;

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
  pattern.state === 'suggested' &&
  pattern.handling !== 'actAndTell' &&
  (pattern.confirmedAt ?? null) === null;

const offerOrder = (a: OpenPattern, b: OpenPattern) =>
  Number(b.handling === 'askOnly') - Number(a.handling === 'askOnly') ||
  b.stateAt - a.stateAt ||
  a.id.localeCompare(b.id);

const selectProjectItems = (state: RootState) => state.helm.projects.items;
const selectHabitItems = (state: RootState) => state.helm.habits.items;
const selectOpenTaskItems = (state: RootState) => state.helm.openTasks.items;

type SubjectLife = 'live' | 'paused' | 'gone';

const readThingLife = (
  collection: 'projects' | 'habits',
  id: string,
  projects: ReturnType<typeof selectProjectItems>,
  habits: ReturnType<typeof selectHabitItems>,
): SubjectLife => {
  const item = (collection === 'habits' ? habits : projects).find(
    (one) => one.id === id,
  );
  return !item || item.isUnreadable
    ? 'gone'
    : item.status === 'active'
      ? 'live'
      : item.status === 'paused'
        ? 'paused'
        : 'gone';
};

/** Whether what a guardrail asks about is still there to hold: gone when finished, ended or removed, paused when already set aside by another route. */
const readSubjectLife = (
  pattern: OpenPattern,
  projects: ReturnType<typeof selectProjectItems>,
  habits: ReturnType<typeof selectHabitItems>,
  tasks: ReturnType<typeof selectOpenTaskItems>,
): SubjectLife => {
  const { subject } = pattern;
  if (subject.id === null) return 'gone';
  if (subject.collection === 'tasks')
    return tasks.some((task) => task.id === subject.id && !task.isUnreadable)
      ? 'live'
      : 'gone';
  const own = readThingLife(
    subject.collection === 'habits' ? 'habits' : 'projects',
    subject.id,
    projects,
    habits,
  );
  const started =
    pattern.moment !== 'onStart' ||
    subject.otherId === null ||
    subject.otherId === subject.id
      ? 'live'
      : readThingLife(
          habits.some((one) => one.id === subject.otherId)
            ? 'habits'
            : 'projects',
          subject.otherId,
          projects,
          habits,
        );
  return own === 'gone' || started === 'gone' ? 'gone' : own;
};

/** The guardrails (advice to hold something off): accepted first, then asked, then not yet asked, then what was said no to. One still asking about something finished or removed is left out, and one whose subject was paused another way reads as no longer true, both worked out here and never written. */
export const selectGuardrailRows = createSelector(
  [
    selectShownPatterns,
    selectProjectItems,
    selectHabitItems,
    selectOpenTaskItems,
  ],
  (patterns, projects, habits, tasks): NoticedRow[] =>
    patterns
      .filter(
        (pattern) =>
          patternFamily(pattern.kind) === 'guardrail' &&
          pattern.statement !== '',
      )
      .flatMap((pattern): OpenPattern[] => {
        const isAsking =
          pattern.state === 'suggested' &&
          pattern.offReason === null &&
          (pattern.confirmedAt ?? null) === null;
        const life = isAsking
          ? readSubjectLife(pattern, projects, habits, tasks)
          : 'live';
        return life === 'live'
          ? [pattern]
          : life === 'gone'
            ? []
            : [{ ...pattern, state: 'retired' }];
      })
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

const selectOfferable = createSelector(
  [selectNoticedRows, selectGuardrailRows, selectIsLearningOn],
  (noticed, guardrails, isLearningOn): OpenPattern[] =>
    [
      ...noticed,
      ...(isLearningOn
        ? guardrails.filter((row) => row.pattern.moment !== 'onStart')
        : []),
    ].map((row) => row.pattern),
);

/** The one offer Today shows: care first, then the newest; a start-time guardrail never appears here. */
export const selectTodayOffer = createSelector(
  [selectOfferable],
  (patterns): OpenPattern | null =>
    patterns.filter(isOffer).sort(offerOrder)[0] ?? null,
);

/** The guardrail asking on one project, goal or habit's page. */
export const selectSubjectGuardrail = createSelector(
  [
    selectGuardrailRows,
    selectIsLearningOn,
    (_state: RootState, id: string) => id,
  ],
  (rows, isLearningOn, id): OpenPattern | null =>
    (isLearningOn ? rows : [])
      .map((row) => row.pattern)
      .filter(
        (pattern) =>
          isOffer(pattern) &&
          pattern.subject.collection !== 'tasks' &&
          (pattern.subject.id === id || pattern.subject.otherId === id),
      )[0] ?? null,
);

/** The newest start-time guardrail about one of `ids`, the records a turn made (joined with a comma). */
export const selectStartGuardrail = createSelector(
  [
    selectGuardrailRows,
    selectIsLearningOn,
    (_state: RootState, ids: string) => ids,
  ],
  (rows, isLearningOn, ids): OpenPattern | null =>
    (isLearningOn ? rows : [])
      .map((row) => row.pattern)
      .filter(
        (pattern) =>
          isOffer(pattern) &&
          pattern.moment === 'onStart' &&
          ids.split(',').includes(pattern.subject.otherId ?? ''),
      )
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
  [selectShownPatterns, selectIsLearningOn],
  (patterns, isLearningOn): AvoidBucket[] =>
    (isLearningOn ? patterns : []).flatMap((pattern) =>
      pattern.state === 'accepted' &&
      pattern.effect.kind === 'plannerAvoid' &&
      pattern.effect.bucket.kind === 'weekdayPart'
        ? [pattern.effect.bucket]
        : [],
    ),
);
