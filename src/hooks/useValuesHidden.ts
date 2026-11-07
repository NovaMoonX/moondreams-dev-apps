import { createContext, useContext, useSyncExternalStore } from 'react';

import { createScrambleSeed } from '@/utils/moneyScramble';

const STORAGE_PREFIX = 'values-hidden';
const FALLBACK_KEY = `${STORAGE_PREFIX}:device`;
const HIDDEN = 'hidden';
const SHOWN = 'shown';
const SCRAMBLED = 'scrambled:';
const SCRAMBLED_HIDDEN = 'scrambled-hidden:';

const cache = new Map<string, string>();
const listeners = new Set<() => void>();

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const read = (key: string) => {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const stored = readStored(key);
  const result =
    stored === SHOWN ||
    stored?.startsWith(SCRAMBLED) ||
    stored?.startsWith(SCRAMBLED_HIDDEN)
      ? stored
      : HIDDEN;
  cache.set(key, result);
  return result;
};

const write = (key: string, mode: string) => {
  if (read(key) === mode) return;
  cache.set(key, mode);
  try {
    localStorage.setItem(key, mode);
  } catch {
    // The choice still holds in memory for this visit.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const toSeed = (mode: string) => {
  const prefix = [SCRAMBLED, SCRAMBLED_HIDDEN].find((entry) =>
    mode.startsWith(entry),
  );
  if (prefix === undefined) return null;
  const seed = Number(mode.slice(prefix.length));
  return Number.isInteger(seed) && seed > 0 ? seed : null;
};

// While made-up amounts are on, the eye flips between made-up and masked and never reaches the real figures.
const getToggled = (mode: string) => {
  const seed = toSeed(mode);
  if (seed !== null) {
    return mode.startsWith(SCRAMBLED_HIDDEN)
      ? `${SCRAMBLED}${seed}`
      : `${SCRAMBLED_HIDDEN}${seed}`;
  }
  return mode === HIDDEN ? SHOWN : HIDDEN;
};

/** The storage key the shown-or-hidden choice lives under; `ValuesHiddenProvider` builds it from a scope id and the signed-in uid. */
export const ValuesHiddenKeyContext = createContext<string>(FALLBACK_KEY);

export const getValuesHiddenKey = (scopeId: string, uid: string | null) =>
  `${STORAGE_PREFIX}:${scopeId}:${uid ?? 'signed-out'}`;

/** Hides shown figures again; the provider calls it when the page has been away for a while. Made-up amounts stay made up. */
export const hideValues = (key: string) => {
  if (read(key) === SHOWN) write(key, HIDDEN);
};

/** The seed of the made-up amounts under a key, or null while real ones are hidden or shown. */
export function useScrambleSeed(key: string) {
  const mode = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => HIDDEN,
  );
  return toSeed(mode);
}

/** Whether private figures are masked or made up, shared by everything under one provider. Hidden until the person shows them, kept on this device only. Made-up amounts render like shown ones (`ValuesHiddenProvider` swaps the figures), and only `setScrambled(false)` brings the real ones back. */
export function useValuesHidden() {
  const key = useContext(ValuesHiddenKeyContext);
  const mode = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => HIDDEN,
  );
  const isScrambled = toSeed(mode) !== null;
  const isHidden = mode === HIDDEN || mode.startsWith(SCRAMBLED_HIDDEN);
  const toggle = () => write(key, getToggled(read(key)));
  const setScrambled = (isOn: boolean) =>
    write(key, isOn ? `${SCRAMBLED}${createScrambleSeed()}` : HIDDEN);

  return { isHidden, isScrambled, toggle, setScrambled };
}

export default useValuesHidden;
