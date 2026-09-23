import { useCallback, useEffect, useRef, useState } from 'react';

/** Shared debounce delays, so every mini-app's autocomplete/auto-fetch feels the same. */
export const DEBOUNCE_MS = {
  autocomplete: 450,
  linkDetection: 800,
} as const;

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

/** Imperative counterpart for event handlers: `run(...)` restarts the timer, `cancel()` drops
 * a pending call. Always invokes the latest `callback`, and cancels on unmount. */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const cancel = useCallback(() => clearTimeout(timeoutRef.current), []);

  const run = useCallback(
    (...args: Args) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );

  return { run, cancel };
}
