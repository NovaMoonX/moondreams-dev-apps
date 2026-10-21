import { useCallback, useMemo, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

const subscribe = (listener: () => void) => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key) {
      memory.delete(event.key);
    }
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
};

const readRaw = (key: string) => {
  const remembered = memory.get(key);
  if (remembered !== undefined) {
    return remembered;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const parseRaw = <T>(
  raw: string | null,
  defaultValue: T,
  parse: (stored: unknown) => T | null,
) => {
  if (raw === null) {
    return defaultValue;
  }
  try {
    return parse(JSON.parse(raw)) ?? defaultValue;
  } catch {
    return defaultValue;
  }
};

const readValue = <T>(
  key: string,
  defaultValue: T,
  parse: (stored: unknown) => T | null,
) => parseRaw(readRaw(key), defaultValue, parse);

/** A per-viewer value remembered in this browser and shared by every component reading the key; `parse` returns null for an unusable stored value, and `defaultValue` and `parse` live at module level. The setter also takes a function of the value stored right now, for a change that must not overwrite one made since the render. */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  parse: (stored: unknown) => T | null,
) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );

  const value = useMemo(
    () => parseRaw(raw, defaultValue, parse),
    [raw, defaultValue, parse],
  );

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (current: T) => T)(readValue(key, defaultValue, parse))
          : next;
      const serialized = JSON.stringify(resolved);
      memory.set(key, serialized);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // The in-memory copy still carries the choice for this session.
      }
      listeners.forEach((listener) => listener());
    },
    [key, defaultValue, parse],
  );

  return [value, setValue] as const;
}
