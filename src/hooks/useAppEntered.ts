import { useEffect, useSyncExternalStore } from 'react';

const enteredCounts = new Map<string, number>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Marks `scope` (an app id, or `site` for home) as entered while the caller is mounted with `isEntered` true. */
export function useMarkAppEntered(scope: string, isEntered = true) {
  useEffect(() => {
    if (!isEntered) return;
    enteredCounts.set(scope, (enteredCounts.get(scope) ?? 0) + 1);
    notify();
    return () => {
      const count = (enteredCounts.get(scope) ?? 1) - 1;
      if (count > 0) enteredCounts.set(scope, count);
      else enteredCounts.delete(scope);
      notify();
    };
  }, [scope, isEntered]);
}

/** Whether `scope`'s own screens are showing: past its loading, sign-in, landing, locked and error states. */
export function useIsAppEntered(scope: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => scope !== null && enteredCounts.has(scope),
  );
}
