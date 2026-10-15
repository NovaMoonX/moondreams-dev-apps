import { createContext, useContext, useEffect, useState } from 'react';

/** What the tabs keep while Pinch stays open: a value per key, outliving a tab switch and cleared with the screen. */
export const PinchSessionContext = createContext<Map<string, unknown> | null>(
  null,
);

/**
 * Like `useState`, but the value is kept in Pinch's session under `key`, so a tab that unmounts on a
 * switch opens again as it was. `override`, when given, wins over the kept value on mount.
 */
export function usePinchSessionState<T>(
  key: string,
  initial: T | (() => T),
  override?: T,
) {
  const session = useContext(PinchSessionContext);
  const [value, setValue] = useState<T>(() => {
    if (override !== undefined) return override;
    if (session?.has(key)) return session.get(key) as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    session?.set(key, value);
  }, [session, key, value]);

  return [value, setValue] as const;
}
