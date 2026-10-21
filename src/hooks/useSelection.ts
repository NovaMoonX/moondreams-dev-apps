import { useCallback, useEffect, useMemo, useState } from 'react';

import { hasDialogOnTop } from '@/utils/dialogUtils';

const NOTHING: ReadonlySet<string> = new Set();

const RESTORE_WINDOW_MS = 300;

const OPEN_POPUP_SELECTOR =
  '[aria-haspopup][aria-expanded="true"], [role="listbox"], [role="menu"]';

/** Ticks every id given, or unticks them all when they are all ticked already. */
export const toggleIds = (
  current: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> => {
  const given = new Set(ids);
  const isAllTicked = ids.every((id) => current.has(id));
  return new Set(
    isAllTicked
      ? [...current].filter((id) => !given.has(id))
      : [...current, ...given],
  );
};

export interface Selection {
  /** Whether the screen is in its pick-several mode; ticks show only then. */
  isActive: boolean;
  ids: ReadonlySet<string>;
  start: () => void;
  exit: () => void;
  /** Ticks every id given, or unticks them all when they are all ticked already: one tap on a row that stands for several, or on a "select all" shortcut. */
  toggle: (ids: readonly string[]) => void;
}

/** A pick-several mode for a list: which ids are ticked, with Escape leaving the mode unless a dialog or an open menu is above it. The screen leaves it on the back gesture through its own `onBack`, and reads what is ticked against what is still on screen, so an id that has gone is never counted. */
export function useSelection(): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const isActive = selected !== null;

  const start = useCallback(() => setSelected(NOTHING), []);
  const exit = useCallback(() => setSelected(null), []);
  const toggle = useCallback(
    (ids: readonly string[]) =>
      setSelected((current) =>
        current === null ? current : toggleIds(current, ids),
      ),
    [],
  );

  // The back gesture ends the mode and the browser then puts the page back where the earlier history entry left it, not where the person scrolled to.
  useEffect(() => {
    if (!isActive) return;

    const place = { top: window.scrollY };
    const handleScroll = () => {
      place.top = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (place.top === 0) return;

      const restore = () => {
        if (window.scrollY === 0) window.scrollTo({ top: place.top });
      };
      window.addEventListener('scroll', restore, { passive: true });
      window.setTimeout(
        () => window.removeEventListener('scroll', restore),
        RESTORE_WINDOW_MS,
      );
    };
  }, [isActive]);

  // Capture, so a dialog on top is still there to be seen before it closes itself on this keydown.
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      const isPopupOpen =
        event.target instanceof Element &&
        event.target.closest(OPEN_POPUP_SELECTOR) !== null;
      if (isPopupOpen || hasDialogOnTop()) return;

      exit();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, exit]);

  const selection = useMemo(
    () => ({ isActive, ids: selected ?? NOTHING, start, exit, toggle }),
    [isActive, selected, start, exit, toggle],
  );
  return selection;
}
