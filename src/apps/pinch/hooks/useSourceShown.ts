import { useEffect, useRef } from 'react';

const listeners = new Set<(sourceId: string) => void>();

/** Asks the Recipes list, which stays mounted under the Sources screen, to show only the recipes from a source. */
export const announceSourceShown = (sourceId: string) =>
  listeners.forEach((listener) => listener(sourceId));

/** Calls `onShown` with each source the Sources screen asks to see while the caller is mounted. */
export function useOnSourceShown(onShown: (sourceId: string) => void) {
  const latest = useRef(onShown);
  useEffect(() => {
    latest.current = onShown;
  });

  useEffect(() => {
    const listener = (sourceId: string) => latest.current(sourceId);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
