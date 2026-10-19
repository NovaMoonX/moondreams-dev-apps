import { useSyncExternalStore } from 'react';

const SHORT_SCREEN_QUERY = '(max-height: 700px)';

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(SHORT_SCREEN_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getSnapshot = () => window.matchMedia(SHORT_SCREEN_QUERY).matches;

/** True while the window is 700px tall or less (a phone with its browser bars, or any landscape phone). */
export function useIsShortScreen() {
  const isShort = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return isShort;
}
