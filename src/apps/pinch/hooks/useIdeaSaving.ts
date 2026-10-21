import { useSyncExternalStore } from 'react';

const SLOW_SAVE_MS = 1500;

const waiting = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Watches an idea's save: once it has waited a moment for the server, the idea counts as waiting until the save settles either way. */
export const trackIdeaSave = (id: string, saved: Promise<unknown>) => {
  const timer = window.setTimeout(() => {
    waiting.add(id);
    notify();
  }, SLOW_SAVE_MS);
  const settle = () => {
    window.clearTimeout(timer);
    if (waiting.delete(id)) notify();
  };
  saved.then(settle, settle);
};

/** Whether this idea is on the list but its save is still waiting for a connection. */
export const useIsIdeaWaiting = (id: string) =>
  useSyncExternalStore(subscribe, () => waiting.has(id));
