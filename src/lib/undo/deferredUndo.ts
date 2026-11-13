import { useSyncExternalStore } from 'react';

import { UNDO_WINDOW_MS } from '@/lib/undo';

export interface DeferredAction {
  key: string;
  message: string;
  expiresAt: number;
}

interface Entry extends DeferredAction {
  /** Resolves to a sentence for the person when the write fails, or null. */
  commit: () => Promise<string | null>;
  timer: number;
}

/** How long a written action stays hidden after its write resolves, so the listener's update lands before the thing could show again. */
const SETTLE_MS = 4_000;

let entries: Entry[] = [];
let writing = new Set<string>();
let snapshot: DeferredAction[] = [];
let hiddenKeys = new Set<string>();
const inFlight = new Set<Promise<void>>();
const listeners = new Set<() => void>();
const failureListeners = new Set<(message: string) => void>();

const emit = () => {
  snapshot = entries.map(({ key, message, expiresAt }) => ({
    key,
    message,
    expiresAt,
  }));
  hiddenKeys = new Set([...entries.map((entry) => entry.key), ...writing]);
  listeners.forEach((listener) => listener());
};

const take = (key: string) => {
  const entry = entries.find((candidate) => candidate.key === key) ?? null;
  if (entry === null) return null;
  window.clearTimeout(entry.timer);
  entries = entries.filter((candidate) => candidate !== entry);
  return entry;
};

const stopHiding = (key: string) => {
  writing = new Set([...writing].filter((candidate) => candidate !== key));
  emit();
};

// The thing stays hidden while its write runs; a failure shows it again at once, a success a moment later.
const commitNow = (key: string) => {
  const entry = take(key);
  if (entry === null) return Promise.resolve();
  writing = new Set([...writing, key]);
  emit();
  const run: Promise<void> = entry
    .commit()
    .catch(() => "That didn't save. Try again in a moment.")
    .then((failure) => {
      if (failure === null) {
        window.setTimeout(() => stopHiding(key), SETTLE_MS);
        return;
      }
      stopHiding(key);
      failureListeners.forEach((listener) => listener(failure));
    })
    .finally(() => inFlight.delete(run));
  inFlight.add(run);
  return run;
};

const startTimer = (key: string, expiresAt: number) =>
  window.setTimeout(() => void commitNow(key), expiresAt - Date.now());

/**
 * Shows an action as done at once and writes it only once its Undo has passed (or the page is
 * hidden), so nobody else sees it flicker back. Callers hide the thing while `useIsDeferred(key)`.
 * A newer action restarts the clock of those still waiting, so each Undo shown has its full time.
 */
export function deferAction(
  key: string,
  message: string,
  commit: () => Promise<string | null>,
) {
  if (entries.some((entry) => entry.key === key)) void commitNow(key);
  const expiresAt = Date.now() + UNDO_WINDOW_MS;
  entries = [
    ...entries.map((entry) => {
      window.clearTimeout(entry.timer);
      return { ...entry, expiresAt, timer: startTimer(entry.key, expiresAt) };
    }),
    { key, message, commit, expiresAt, timer: startTimer(key, expiresAt) },
  ];
  emit();
}

/** Drops a deferred action before it is written; nothing reaches the server. */
export function undoDeferred(key: string) {
  if (take(key) !== null) emit();
}

/** Writes one deferred action now and resolves once its write has settled, for a step that needs the server to agree first. */
export function commitDeferred(key: string) {
  return commitNow(key);
}

/** Writes every deferred action now: the page is going away and may never get its timers back. */
export function commitAllDeferred() {
  entries.map((entry) => entry.key).forEach((key) => void commitNow(key));
}

/** Writes every deferred action and waits for each write to settle, for a sign-out or account switch that must not leave work behind under the wrong account. */
export async function settleAllDeferred() {
  commitAllDeferred();
  await Promise.allSettled([...inFlight]);
}

/** Hears the sentence of a deferred write that failed; returns the unsubscribe. */
export function onDeferredFailure(listener: (message: string) => void) {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The actions still waiting with an Undo offered, oldest first. */
export const useDeferredActions = () =>
  useSyncExternalStore(subscribe, () => snapshot);

/** Whether the thing behind `key` should be hidden: its Undo is offered or its write has not settled yet. */
export const useIsDeferred = (key: string) =>
  useSyncExternalStore(subscribe, () => hiddenKeys.has(key));

/** The keys of every thing to hide, for a list that checks many at once. */
export const useHiddenDeferredKeys = () =>
  useSyncExternalStore(subscribe, () => hiddenKeys);
