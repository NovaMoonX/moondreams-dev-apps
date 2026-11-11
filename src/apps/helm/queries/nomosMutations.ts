import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';
import { generateUuid } from '@/utils';
import type { HeldReason } from '@apps/helm/types';

interface SortResult {
  status: 'sorted' | 'received' | 'needsYou' | 'failed';
  executionId: string | null;
  releasedIds?: string[];
}

export type SortMode = 'full' | 'rest';

/** `held` when the server's limit or budget turned the call away (`heldReason` says which); `notSorted` when it answered but the reading failed and left the turn as it was. */
export interface SortOutcome {
  kind: 'done' | 'held' | 'failed' | 'notSorted' | 'skipped';
  heldReason: HeldReason | null;
}

const outcome = (
  kind: SortOutcome['kind'],
  heldReason: HeldReason | null = null,
): SortOutcome => ({ kind, heldReason });

const toHeldReason = (error: unknown): HeldReason | null => {
  const reason =
    error instanceof Error &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'heldReason' in error.details
      ? error.details.heldReason
      : null;
  return reason === 'recentLimit' ||
    reason === 'dailyLimit' ||
    reason === 'budgetReached'
    ? reason
    : null;
};

const sortHelmCaptureCallable = httpsCallable<
  { captureId: string; requestKey: string; mode: SortMode; noteIds: string[] },
  SortResult
>(functions, 'sortHelmCapture');

/** Turns whose sorting call is out: the home line reads "Reading…" for them until the server's status says otherwise. */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const isSorting = (captureId: string) => inFlight.has(captureId);

/** Turns whose last call in this tab failed for want of a connection or an answer in time, so a waiting turn can say the service couldn't be reached. */
const unreachable = new Set<string>();

export const isUnreachable = (captureId: string) => unreachable.has(captureId);

export const subscribeSorting = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const isConnectionError = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  (error.code === 'functions/unavailable' ||
    error.code === 'functions/deadline-exceeded');

/** Asks the server to sort one saved turn, once. A failure is logged and leaves the turn saved as written. */
export async function sortCapture(
  captureId: string,
  mode: SortMode = 'full',
  noteIds: string[] = [],
): Promise<SortOutcome> {
  if (inFlight.has(captureId)) return outcome('skipped');
  inFlight.add(captureId);
  notify();
  try {
    const result = await sortHelmCaptureCallable({
      captureId,
      requestKey: generateUuid(),
      mode,
      noteIds,
    });
    unreachable.delete(captureId);
    const { status, releasedIds } = result.data;
    void (releasedIds ?? []).reduce(
      (chain, id) => chain.then(() => sortCapture(id)),
      Promise.resolve<unknown>(undefined),
    );
    const isSorted =
      mode === 'rest'
        ? status === 'sorted'
        : status === 'sorted' || status === 'needsYou';
    return outcome(isSorted ? 'done' : 'notSorted');
  } catch (error) {
    const isHeld =
      error instanceof Error &&
      'code' in error &&
      error.code === 'functions/resource-exhausted';
    if (!isHeld) console.error('Helm could not sort a turn', error);
    if (isConnectionError(error)) unreachable.add(captureId);
    else unreachable.delete(captureId);
    return isHeld ? outcome('held', toHeldReason(error)) : outcome('failed');
  } finally {
    inFlight.delete(captureId);
    notify();
  }
}

export interface TopicWriteResult {
  status: 'written' | 'current' | 'busy' | 'limited' | 'failed';
  version: number;
  broughtIn: number;
  waiting: number;
}

const writeHelmTopicCallable = httpsCallable<
  { topicId: string },
  TopicWriteResult
>(functions, 'writeHelmTopic');

/** What this tab knows of a topic's write: out now, held back for the day (with how many wait), or not made. A topic with no entry has nothing to report. */
export type TopicWriteState =
  | { kind: 'writing' }
  | { kind: 'limited'; waiting: number }
  | { kind: 'failed' };

const topicWrites = new Map<string, TopicWriteState>();
const topicWriteListeners = new Set<() => void>();

const setTopicWrite = (topicId: string, state: TopicWriteState | null) => {
  if (state) topicWrites.set(topicId, state);
  else topicWrites.delete(topicId);
  topicWriteListeners.forEach((listener) => listener());
};

export const getTopicWriteState = (topicId: string) =>
  topicWrites.get(topicId) ?? null;

export const subscribeTopicWrites = (listener: () => void) => {
  topicWriteListeners.add(listener);
  return () => {
    topicWriteListeners.delete(listener);
  };
};

/** Asks the server to bring a topic's new notes into its document, once at a time per topic. A failure leaves the document as it was. */
export async function writeTopic(topicId: string): Promise<void> {
  if (topicWrites.get(topicId)?.kind === 'writing') return;
  setTopicWrite(topicId, { kind: 'writing' });
  try {
    const { status, waiting } = (await writeHelmTopicCallable({ topicId }))
      .data;
    setTopicWrite(
      topicId,
      status === 'limited'
        ? { kind: 'limited', waiting }
        : status === 'failed'
          ? { kind: 'failed' }
          : null,
    );
  } catch (error) {
    console.error('Helm could not write a topic', error);
    setTopicWrite(topicId, { kind: 'failed' });
  }
}

export interface QuestionAnswerInput {
  by: 'tap' | 'voice';
  optionId?: string;
  /** The topics ticked on a which-topics question. */
  optionIds?: string[];
  /** The person's own statement, with the answer "none" to which fact is true. */
  text?: string;
}

/** `answered` when another device already answered (nothing to show), `stale` when the question closed because its facts changed since (nothing was written), `gone` when the chosen person or place no longer exists, `offline` when there was no connection (nothing is queued). */
export interface ResolveOutcome {
  kind: 'done' | 'answered' | 'stale' | 'gone' | 'offline' | 'failed';
  executionId: string | null;
}

const resolveHelmQuestionCallable = httpsCallable<
  { captureId: string; questionId: string; answer: QuestionAnswerInput },
  { executionId: string | null; isStale?: boolean }
>(functions, 'resolveHelmQuestion');

const toErrorCode = (error: unknown) =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;

const resolved = (
  kind: ResolveOutcome['kind'],
  executionId: string | null = null,
): ResolveOutcome => ({ kind, executionId });

const isGoneRefusal = (error: unknown) =>
  error instanceof Error &&
  'details' in error &&
  (error.details as { reason?: unknown } | null)?.reason === 'gone';

/** Answers one open which-person or which-place question on the server. The answer needs a connection and is never queued. */
export async function resolveQuestion(
  captureId: string,
  questionId: string,
  answer: QuestionAnswerInput,
): Promise<ResolveOutcome> {
  try {
    const result = await resolveHelmQuestionCallable({
      captureId,
      questionId,
      answer,
    });
    return result.data.isStale === true
      ? resolved('stale')
      : resolved('done', result.data.executionId);
  } catch (error) {
    const code = toErrorCode(error);
    if (code === 'functions/already-exists') return resolved('answered');
    if (code === 'functions/failed-precondition' && isGoneRefusal(error)) {
      return resolved('gone');
    }
    if (isConnectionError(error)) return resolved('offline');
    console.error('Helm could not answer a question', error);
    return resolved('failed');
  }
}
