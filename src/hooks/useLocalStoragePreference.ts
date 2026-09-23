import { useState } from 'react';

function readStoredPreference(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  } catch {
    return defaultValue;
  }
}

/** Any mini-app's per-viewer boolean preference (a view toggle, "show archived",
 * etc.) — remembered locally, and never blocking rendering if storage is
 * unavailable (private browsing, blocked site data, etc). */
export function useLocalStoragePreference(key: string, defaultValue: boolean) {
  const [value, setValueState] = useState(() => readStoredPreference(key, defaultValue));

  const setValue = (next: boolean) => {
    setValueState(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Ignore — the in-memory state still reflects the choice for this session.
    }
  };

  return [value, setValue] as const;
}
