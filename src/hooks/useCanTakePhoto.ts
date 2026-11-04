import { useSyncExternalStore } from 'react';

const TOUCH_QUERY = '(pointer: coarse)';

const subscribe = (onChange: () => void) => {
  const list = window.matchMedia(TOUCH_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
};

/** True on a touch screen, where a file input can open the camera; a computer's chooser has no camera, so it shows upload only. */
export function useCanTakePhoto() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false,
  );
}
