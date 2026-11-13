import { HELM_COPY } from '@apps/helm/constants';
import type { OpenExecution } from '@apps/helm/types';

export interface ActivityDay {
  dayStart: number;
  items: OpenExecution[];
}

export const toDayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
};

/** Newest-first executions under their local days, in the order given. */
export const groupByDay = (items: OpenExecution[]): ActivityDay[] =>
  [
    ...items.reduce((days, item) => {
      const dayStart = toDayStart(item.createdAt);
      const day = days.get(dayStart);
      if (day) day.push(item);
      else days.set(dayStart, [item]);
      return days;
    }, new Map<number, OpenExecution[]>()),
  ].map(([dayStart, dayItems]) => ({ dayStart, items: dayItems }));

/** A plan still waiting on its suggestions is not a thing the assistant did yet. */
export const isShownInActivity = (execution: OpenExecution) =>
  !(execution.category === 'plan' && execution.state === 'proposed');

const withoutPeriod = (text: string) => text.replace(/[.!]+$/, '');

/** One line for a row: what was done, as the summary the execution sealed. */
export function getActivityLine(execution: OpenExecution) {
  if (execution.isUnreadable) return HELM_COPY.unreadable;
  if (!execution.summary) return HELM_COPY.activityMadeChange;
  return execution.category === 'undo'
    ? HELM_COPY.youTookBack(withoutPeriod(execution.summary))
    : withoutPeriod(execution.summary);
}

const toTitle = (execution: OpenExecution) =>
  execution.effects
    .map((effect) => effect.written['sealed.title'])
    .find((title): title is string => typeof title === 'string' && !!title) ??
  null;

const countRecords = (execution: OpenExecution, isImport = false) =>
  new Set(
    execution.effectRefs
      .filter((ref) =>
        isImport
          ? ref.collection === 'who'
          : ref.collection !== 'who' &&
            ref.collection !== 'places' &&
            ref.collection !== 'media',
      )
      .map((ref) => ref.docId),
  ).size;

/** The first task an execution touched, with how many more it touched; null when its payload names none. */
export function getActivitySubject(execution: OpenExecution) {
  const title = execution.isUnreadable ? null : toTitle(execution);
  return title
    ? HELM_COPY.activitySubject(title, countRecords(execution) - 1)
    : null;
}

/** Whether a row was taken back in full or in part; `undo` is the execution that took it back, once that is loaded. */
export function getTakenBackMark(
  execution: OpenExecution,
  undo: OpenExecution | null,
) {
  if (execution.undoneByExecutionId === null) return null;
  const isImport = execution.category === 'import';
  const isPartial =
    !!undo &&
    (!!undo.goneIds?.length ||
      (isImport
        ? countRecords(undo, true) < countRecords(execution, true)
        : undo.effectRefs.length < countRecords(execution)));
  return isPartial ? HELM_COPY.partlyTakenBackLabel : HELM_COPY.takenBackLabel;
}
