import { useEffect, useSyncExternalStore } from 'react';

const enteredCounts = new Map<string, number>();
const askingCounts = new Map<string, number>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const useCounted = (
  counts: Map<string, number>,
  scope: string,
  isOn: boolean,
) => {
  useEffect(() => {
    if (!isOn) return;
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    notify();
    return () => {
      const count = (counts.get(scope) ?? 1) - 1;
      if (count > 0) counts.set(scope, count);
      else counts.delete(scope);
      notify();
    };
  }, [counts, scope, isOn]);
};

/** Marks `scope` (an app id, or `site` for home) as entered while the caller is mounted with `isEntered` true. */
export function useMarkAppEntered(scope: string, isEntered = true) {
  useCounted(enteredCounts, scope, isEntered);
}

/** Marks `scope` as asking the person something of its own (a sheet it opened by itself), so nothing else opens over it. */
export function useMarkAppAsking(scope: string, isAsking = true) {
  useCounted(askingCounts, scope, isAsking);
}

/** Whether `scope`'s own screens are showing and free: past its loading, sign-in, landing, locked and error states, with no question of its own open. */
export function useIsAppEntered(scope: string | null) {
  return useSyncExternalStore(
    subscribe,
    () =>
      scope !== null && enteredCounts.has(scope) && !askingCounts.has(scope),
  );
}
