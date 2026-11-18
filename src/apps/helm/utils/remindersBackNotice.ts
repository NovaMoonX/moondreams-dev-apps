import { useSyncExternalStore } from 'react';

const KEY = 'helm.remindersBackAt';
const listeners = new Set<() => void>();

const read = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const emit = () => listeners.forEach((listener) => listener());

/** Remembers on this device that a check-in just ended the idle pause, so Today can say so once. */
export const notifyRemindersBack = () => {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  emit();
};

export const dismissRemindersBack = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
  emit();
};

/** True from the check-in that ended the idle pause until Today's line is dismissed. */
export const useRemindersBack = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read() !== null,
    () => false,
  );
