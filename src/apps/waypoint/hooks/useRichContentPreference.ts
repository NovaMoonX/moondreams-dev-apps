import { useState } from 'react';

const STORAGE_KEY = 'waypoint:richContent';

function readStoredPreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/** Per-viewer preference for showing images/link previews on the Timeline —
 * on by default, remembered locally, and never blocking rendering if storage is
 * unavailable (private browsing, blocked site data, etc). */
export function useRichContentPreference() {
  const [showRichContent, setShowRichContentState] = useState(readStoredPreference);

  const setShowRichContent = (value: boolean) => {
    setShowRichContentState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore — the in-memory state still reflects the choice for this session.
    }
  };

  return { showRichContent, setShowRichContent };
}
