import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { describeScheduledOutcome } from '@apps/helm/engine/scheduledActions';
import { selectEveryCapture } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture, OpenScheduledAction } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.scheduledActions.items;
const selectHomeZone = (state: RootState) =>
  state.helm.profile?.timeZone ?? 'UTC';

const isShown = (action: OpenScheduledAction) =>
  !action.isUnreadable && action.status !== 'ended';

/** The actions still going, soonest next run first, with the paused ones after. */
export const selectScheduledActions = createSelector([selectItems], (items) => {
  const shown = items.filter(isShown);
  return [
    ...shown
      .filter((action) => action.status === 'active')
      .sort(
        (left, right) =>
          (left.nextRunAt ?? Infinity) - (right.nextRunAt ?? Infinity) ||
          left.createdAt - right.createdAt,
      ),
    ...shown
      .filter((action) => action.status === 'paused')
      .sort((left, right) => left.createdAt - right.createdAt),
  ];
});

/** How many count against the cap of 50: an ended action leaves the count. */
export const selectScheduledCount = createSelector(
  [selectItems],
  (items) => items.filter((action) => action.status !== 'ended').length,
);

export interface ScheduledOutcomeRow {
  id: string;
  actionId: string;
  at: number;
  outcome: NonNullable<OpenScheduledAction['lastOutcome']>;
  captureId: string | null;
  line: string;
}

/** The last run of each action that happened after `since` (the time of the person's previous open), newest first, each as the one line Today and Activity show. A waiting run is listed until it goes. */
export const selectScheduledOutcomes = createSelector(
  [selectItems, selectHomeZone, (_state: RootState, since: number) => since],
  (items, homeZone, since): ScheduledOutcomeRow[] =>
    items
      .flatMap((action): ScheduledOutcomeRow[] =>
        action.isUnreadable ||
        action.lastOutcome === null ||
        action.lastRunAt === null ||
        action.lastRunDueAt === null ||
        action.lastRunAt < since
          ? []
          : [
              {
                id: `${action.id}:${action.lastRunDueAt}`,
                actionId: action.id,
                at: action.lastRunAt,
                outcome: action.lastOutcome,
                captureId: action.lastRunCaptureId,
                line: describeScheduledOutcome({
                  title: action.title,
                  outcome: action.lastOutcome,
                  reason: action.lastFailReason,
                  dueAt: action.lastRunDueAt,
                  zone: action.timeZone ?? homeZone,
                }),
              },
            ],
      )
      .sort((left, right) => right.at - left.at),
);

/** The actions the person ended, newest first; one that ended on its own after its last run is left out. */
export const selectEndedScheduled = createSelector([selectItems], (items) =>
  items
    .filter(
      (action) =>
        !action.isUnreadable &&
        action.status === 'ended' &&
        action.endedBy === 'person',
    )
    .sort(
      (left, right) =>
        (right.lastEditedAt ?? right.createdAt) -
        (left.lastEditedAt ?? left.createdAt),
    ),
);

export const selectScheduledById = createSelector(
  [selectItems],
  (items) => new Map(items.map((action) => [action.id, action])),
);

const selectUnseenRaw = (state: RootState) =>
  state.helm.unseenCaptures.captures;

/** The turns scheduled runs made, by id, from every set the device holds (the unseen ones included). */
const selectRunCaptures = createSelector(
  [selectEveryCapture, selectUnseenRaw],
  (every, unseen) =>
    new Map<string, OpenCapture>(
      [...every, ...unseen]
        .filter((capture) => capture.arrivedVia === 'scheduled')
        .map((capture) => [capture.id, capture]),
    ),
);

export interface ScheduledRunLine extends ScheduledOutcomeRow {
  reason: OpenScheduledAction['lastFailReason'];
  dueAt: number;
  title: string;
  /** The run's turn has not been looked at yet. */
  isUnseen: boolean;
  seenAt: number | null;
  executionId: string | null;
}

/** The last run of every action as the line Today and Activity show; whether it is unseen comes from the run's own turn, never from a last-open time. */
export const selectScheduledRuns = createSelector(
  [selectItems, selectHomeZone, selectRunCaptures],
  (items, homeZone, captures): ScheduledRunLine[] =>
    items
      .flatMap((action): ScheduledRunLine[] => {
        if (
          action.isUnreadable ||
          action.lastOutcome === null ||
          action.lastRunAt === null ||
          action.lastRunDueAt === null
        )
          return [];
        const capture =
          action.lastRunCaptureId === null
            ? null
            : (captures.get(action.lastRunCaptureId) ?? null);
        return [
          {
            id: `${action.id}:${action.lastRunDueAt}`,
            actionId: action.id,
            at: action.lastRunAt,
            outcome: action.lastOutcome,
            captureId: action.lastRunCaptureId,
            reason: action.lastFailReason,
            dueAt: action.lastRunDueAt,
            title: action.title,
            isUnseen: capture === null ? false : capture.seenAt === null,
            seenAt: capture?.seenAt ?? null,
            executionId: capture?.executionIds[0] ?? null,
            line: describeScheduledOutcome({
              title: action.title,
              outcome: action.lastOutcome,
              reason: action.lastFailReason,
              dueAt: action.lastRunDueAt,
              zone: action.timeZone ?? homeZone,
            }),
          },
        ];
      })
      .sort((left, right) => right.at - left.at),
);
