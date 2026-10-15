import { useEffect, useRef } from 'react';

const listeners = new Set<(recipeId: string) => void>();

/** Tells whichever list is showing that a recipe was just added, so it can bring the new row into view. */
export const announceRecipeAdded = (recipeId: string) =>
  listeners.forEach((listener) => listener(recipeId));

/** Calls `onAdded` with each recipe added while the caller is mounted. */
export function useOnRecipeAdded(onAdded: (recipeId: string) => void) {
  const latest = useRef(onAdded);
  useEffect(() => {
    latest.current = onAdded;
  });

  useEffect(() => {
    const listener = (recipeId: string) => latest.current(recipeId);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
