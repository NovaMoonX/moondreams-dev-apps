import { useCallback, useSyncExternalStore } from 'react';

const DEFAULT_MAX_HEIGHT = 700;

/** True while the window is `maxHeight` px tall or less (700 by default: a phone with its browser bars, or any landscape phone). */
export function useIsShortScreen(maxHeight = DEFAULT_MAX_HEIGHT) {
  const query = `(max-height: ${maxHeight}px)`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const isShort = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
  return isShort;
}
