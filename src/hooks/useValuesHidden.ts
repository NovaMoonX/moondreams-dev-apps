import { createContext, useContext, useSyncExternalStore } from 'react';

const STORAGE_PREFIX = 'values-hidden';
const FALLBACK_KEY = `${STORAGE_PREFIX}:device`;

const cache = new Map<string, boolean>();
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
  const result = readStored(key) !== 'shown';
  cache.set(key, result);
  return result;
};

const write = (key: string, isHidden: boolean) => {
  if (read(key) === isHidden) return;
  cache.set(key, isHidden);
  try {
    localStorage.setItem(key, isHidden ? 'hidden' : 'shown');
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

/** The storage key the shown-or-hidden choice lives under; `ValuesHiddenProvider` builds it from a scope id and the signed-in uid. */
export const ValuesHiddenKeyContext = createContext<string>(FALLBACK_KEY);

export const getValuesHiddenKey = (scopeId: string, uid: string | null) =>
  `${STORAGE_PREFIX}:${scopeId}:${uid ?? 'signed-out'}`;

/** Hides the figures again; the provider calls it when the page has been away for a while. */
export const hideValues = (key: string) => write(key, true);

/** Whether private figures are blurred, shared by everything under one provider. Hidden until the person shows them, kept on this device only. */
export function useValuesHidden() {
  const key = useContext(ValuesHiddenKeyContext);
  const isHidden = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => true,
  );
  const toggle = () => write(key, !read(key));

  return { isHidden, toggle };
}

export default useValuesHidden;
