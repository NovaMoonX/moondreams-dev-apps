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

let entries: Entry[] = [];
let snapshot: DeferredAction[] = [];
const listeners = new Set<() => void>();
const failureListeners = new Set<(message: string) => void>();

const emit = () => {
  snapshot = entries.map(({ key, message, expiresAt }) => ({
    key,
    message,
    expiresAt,
  }));
  listeners.forEach((listener) => listener());
};

const take = (key: string) => {
  const entry = entries.find((candidate) => candidate.key === key) ?? null;
  if (entry === null) return null;
  window.clearTimeout(entry.timer);
  entries = entries.filter((candidate) => candidate !== entry);
  return entry;
};

const commitNow = (key: string) => {
  const entry = take(key);
  if (entry === null) return;
  emit();
  void entry
    .commit()
    .catch(() => "That didn't save. Try again in a moment.")
    .then((failure) => {
      if (failure !== null)
        failureListeners.forEach((listener) => listener(failure));
    });
};

/**
 * Shows an action as done at once and writes it only once its Undo has passed (or the page is
 * hidden), so nobody else sees it flicker back. Callers hide the thing while `useIsDeferred(key)`.
 */
export function deferAction(
  key: string,
  message: string,
  commit: () => Promise<string | null>,
) {
  if (entries.some((entry) => entry.key === key)) commitNow(key);
  const timer = window.setTimeout(() => commitNow(key), UNDO_WINDOW_MS);
  entries = [
    ...entries,
    { key, message, commit, timer, expiresAt: Date.now() + UNDO_WINDOW_MS },
  ];
  emit();
}

/** Drops a deferred action before it is written; nothing reaches the server. */
export function undoDeferred(key: string) {
  if (take(key) !== null) emit();
}

/** Writes every deferred action now: the page is going away and may never get its timers back. */
export function commitAllDeferred() {
  entries.map((entry) => entry.key).forEach(commitNow);
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

export const useDeferredActions = () =>
  useSyncExternalStore(subscribe, () => snapshot);

export const useIsDeferred = (key: string) =>
  useSyncExternalStore(subscribe, () =>
    snapshot.some((action) => action.key === key),
  );
