import { formatTime } from '@/utils/formatUtils';
import {
  DAY_MS,
  HELM_COPY,
  SWEEP_LEASE_MS,
  TASK_TITLE_CAP,
} from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';

/** What a turn needs from the person (`needsYou`) or only time (`waiting`). */
export type HeldKind = 'couldNotRead' | 'moreToSort' | 'failed' | 'waiting';

export interface HeldItem {
  kind: HeldKind;
  capture: OpenCapture;
}

const hasOpenQuestion = (capture: OpenCapture, kind: string) =>
  Object.values(capture.questionState).some(
    (question) => question.kind === kind && question.answeredAt === null,
  );

export const toHeldKind = (capture: OpenCapture): HeldKind | null => {
  if (capture.status === 'failed') return 'failed';
  if (capture.status === 'needsYou') {
    if (hasOpenQuestion(capture, 'couldNotRead')) return 'couldNotRead';
    return hasOpenQuestion(capture, 'moreToSort') ? 'moreToSort' : null;
  }
  return capture.status === 'received' ? 'waiting' : null;
};

/** The turns that need the person first, then the ones that wait, each oldest first; any other turn is left out. */
export function toHeldItems(captures: OpenCapture[]): {
  needsYou: HeldItem[];
  waiting: HeldItem[];
} {
  const items = [...captures]
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((capture) => {
      const kind = toHeldKind(capture);
      return kind ? [{ kind, capture }] : [];
    });
  return {
    needsYou: items.filter((item) => item.kind !== 'waiting'),
    waiting: items.filter((item) => item.kind === 'waiting'),
  };
}

// The day's allowance is counted per UTC day, so it comes back at UTC midnight, shown in local time and never split across lines.
const getLimitResetTime = () =>
  formatTime((Math.floor(Date.now() / DAY_MS) + 1) * DAY_MS).replace(
    /\s/g,
    '\u00a0',
  );

/** Why a waiting turn waits, in the words the Inbox and its sheet use. */
export function getWaitingReason(capture: OpenCapture, isUnreachable: boolean) {
  if (capture.heldReason === 'dailyLimit') {
    return HELM_COPY.waitingDailyLimit(getLimitResetTime());
  }
  if (capture.heldReason === 'recentLimit') return HELM_COPY.waitingRecentLimit;
  if (capture.heldReason === 'budgetReached') return HELM_COPY.waitingBudget;
  if (capture.hasPendingWrites || capture.heldReason === 'offline') {
    return HELM_COPY.waitingOnDevice;
  }
  if (capture.heldReason === 'aiUnavailable' || isUnreachable) {
    return HELM_COPY.waitingUnavailable;
  }
  return HELM_COPY.waitingDefault;
}

const SERVICE_DOWN_CODES = [
  'timeout',
  'network',
  'http429',
  'noKey',
  'noModelKey',
];
const UNUSABLE_CODES = [
  'modelError',
  'loopError',
  'limit',
  'refused',
  'noTerminal',
  'badShape',
  'unknownAlias',
  'droppedToken',
  'badDate',
  'nothingToFile',
];

/** The sentence that names why three readings failed, chosen by the server's error code. */
export function getFailedCause(code: string | null, name: string) {
  if (
    code !== null &&
    (SERVICE_DOWN_CODES.includes(code) || /^http5\d\d$/.test(code))
  ) {
    return HELM_COPY.failedServiceDown(name);
  }
  if (code !== null && UNUSABLE_CODES.includes(code)) {
    return HELM_COPY.failedUnusable(name);
  }
  return HELM_COPY.failedGeneric(name);
}

/** Whether the words can be made a task as written without racing a reading: nothing here is sorting the turn, and it is failed, asking, or waiting with no live claim. */
export const canMakeTaskAsWritten = (
  capture: OpenCapture,
  isSortingHere: boolean,
  now: number,
) =>
  !isSortingHere &&
  (capture.status === 'failed' ||
    capture.status === 'needsYou' ||
    (capture.status === 'received' &&
      (capture.claimedAt === null ||
        now - capture.claimedAt > SWEEP_LEASE_MS)));

/** A task title from the words as written, cut at a word to the title cap. */
export function toTaskTitle(text: string) {
  const words = text.replace(/\s+/g, ' ').trim();
  if (words.length <= TASK_TITLE_CAP) return words;
  const cut = words.slice(0, TASK_TITLE_CAP);
  const space = cut.lastIndexOf(' ');
  return (space > TASK_TITLE_CAP / 2 ? cut.slice(0, space) : cut).trim();
}

/** The line under a held turn on home, short enough to stay one quiet line; null when the turn is not held. */
export function getHomeHeldLine(capture: OpenCapture, isNewest: boolean) {
  const kind = toHeldKind(capture);
  if (kind === null) return null;
  if (kind !== 'waiting') return HELM_COPY.waitingInNeedsYou;
  if (capture.heldReason === 'dailyLimit') {
    return HELM_COPY.savedHeldDaily(getLimitResetTime());
  }
  if (capture.heldReason === 'recentLimit') return HELM_COPY.savedHeldRecent;
  if (capture.heldReason === 'budgetReached') return HELM_COPY.savedHeldBudget;
  return isNewest ? HELM_COPY.savedAsWritten : HELM_COPY.waitingToBeRead;
}
