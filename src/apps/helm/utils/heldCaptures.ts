import { formatTime } from '@/utils/formatUtils';
import {
  DAY_MS,
  HELM_COPY,
  SWEEP_LEASE_MS,
  TASK_TITLE_CAP,
} from '@apps/helm/constants';
import type { HelmQuestion, OpenCapture } from '@apps/helm/types';

/** What a turn needs from the person (`needsYou`) or only time (`waiting`). */
export type HeldKind =
  'couldNotRead' | 'moreToSort' | 'question' | 'failed' | 'waiting';

export interface HeldItem {
  kind: HeldKind;
  capture: OpenCapture;
}

const hasOpenQuestion = (capture: OpenCapture, kinds: string[]) =>
  Object.values(capture.questionState).some(
    (question) => kinds.includes(question.kind) && question.answeredAt === null,
  );

/** Whether the turn still waits on a question the person answers by choosing or writing (which person or place, which fact is true, or one the assistant asked), read from what is readable so a turn whose words won't open still shows. */
export const hasOpenChoice = (capture: OpenCapture) =>
  hasOpenQuestion(capture, [
    'whichPerson',
    'whichPlace',
    'whichIsTrue',
    'whichTopic',
    'groupTopics',
    'asked',
  ]);

export interface OpenQuestion {
  id: string;
  question: HelmQuestion;
  skippedAt: number | null;
}

/** Every question a turn still asks that can be shown, oldest first; a turn's card shows the first few and the rest wait in Needs you. */
export const getOpenQuestions = (capture: OpenCapture): OpenQuestion[] =>
  Object.entries(capture.questionState)
    .filter(([, state]) => state.answeredAt === null)
    .sort(([, a], [, b]) => a.askedAt - b.askedAt)
    .flatMap(([id, state]) =>
      capture.questions[id]
        ? [
            {
              id,
              question: capture.questions[id],
              skippedAt: state.skippedAt,
            },
          ]
        : [],
    );

/** The questions the assistant asked that were answered, oldest first, each with the answer it kept. */
export const getAnsweredQuestions = (capture: OpenCapture) =>
  Object.entries(capture.questionState)
    .filter(([, state]) => state.answeredAt !== null && state.kind === 'asked')
    .sort(([, a], [, b]) => a.askedAt - b.askedAt)
    .flatMap(([id]) => {
      const question = capture.questions[id];
      return question?.answer
        ? [{ id, question, answer: question.answer }]
        : [];
    });

export const toHeldKind = (capture: OpenCapture): HeldKind | null => {
  if (capture.status === 'failed') return 'failed';
  if (capture.status === 'needsYou') {
    if (hasOpenQuestion(capture, ['couldNotRead'])) return 'couldNotRead';
    if (hasOpenQuestion(capture, ['moreToSort'])) return 'moreToSort';
    return hasOpenChoice(capture) ? 'question' : null;
  }
  return capture.status === 'received' ? 'waiting' : null;
};

const ridesWithLead = (capture: OpenCapture, captures: OpenCapture[]) =>
  capture.turnLeadId !== null &&
  capture.status === 'received' &&
  capture.executionIds.length === 0 &&
  captures.some(
    (entry) =>
      entry.id === capture.turnLeadId &&
      entry.joinedCaptureIds.includes(capture.id) &&
      (entry.status === 'received' || entry.status === 'interpreting'),
  );

/** The turns that need the person first, then the ones that wait, each oldest first; any other turn is left out, and so is a joined message while its lead is in the list (it is read with its lead). */
export function toHeldItems(captures: OpenCapture[]): {
  needsYou: HeldItem[];
  waiting: HeldItem[];
} {
  const items = [...captures]
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((capture) => {
      const kind = toHeldKind(capture);
      return kind && !ridesWithLead(capture, captures)
        ? [{ kind, capture }]
        : [];
    });
  return {
    needsYou: items.filter((item) => item.kind !== 'waiting'),
    waiting: items.filter((item) => item.kind === 'waiting'),
  };
}

// The day's allowance is counted per UTC day, so it comes back at UTC midnight, shown in local time and never split across lines.
export const getLimitResetTime = () =>
  formatTime((Math.floor(Date.now() / DAY_MS) + 1) * DAY_MS).replace(
    /\s/g,
    '\u00a0',
  );

const UNAVAILABLE_CODES = ['timeout', 'network', 'http429'];

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
  if (isUnreachable) return HELM_COPY.waitingOnDevice;
  if (
    capture.heldReason === 'aiUnavailable' ||
    (capture.lastErrorCode !== null &&
      (UNAVAILABLE_CODES.includes(capture.lastErrorCode) ||
        /^http5\d\d$/.test(capture.lastErrorCode)))
  ) {
    return HELM_COPY.waitingUnavailable;
  }
  return HELM_COPY.waitingDefault;
}

// Only these can reach `failed`: the transient codes (timeout, network, http429, http5xx, noKey, noModelKey) give their attempt back.
const SERVICE_DOWN_PATTERN = /^http4\d\d$|^http0$/;
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
  'maxTokens',
  'unreadable',
];

/** The sentence that names why three readings failed, chosen by the server's error code. */
export function getFailedCause(code: string | null, name: string) {
  if (code !== null && SERVICE_DOWN_PATTERN.test(code)) {
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
  if (kind === null || kind === 'question') return null;
  if (kind === 'failed') return HELM_COPY.couldNotSort;
  if (kind === 'couldNotRead') {
    const wasReadAgain = Object.values(capture.questionState).some(
      (question) =>
        question.kind === 'couldNotRead' && question.answeredAt !== null,
    );
    return wasReadAgain ? HELM_COPY.readAgainNothing : HELM_COPY.nothingToFile;
  }
  if (kind !== 'waiting') return HELM_COPY.waitingInNeedsYou;
  if (capture.heldReason === 'dailyLimit') {
    return HELM_COPY.savedHeldDaily(getLimitResetTime());
  }
  if (capture.heldReason === 'recentLimit') return HELM_COPY.savedHeldRecent;
  if (capture.heldReason === 'budgetReached') return HELM_COPY.savedHeldBudget;
  return isNewest ? HELM_COPY.savedAsWritten : HELM_COPY.waitingToBeRead;
}
