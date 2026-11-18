import type { Presence } from '@apps/helm/utils/privacy';

const state = { isUntouched: true, lastTouchAt: 0 };
const listeners = new Set<() => void>();

const markTouched = () => {
  state.isUntouched = false;
  state.lastTouchAt = Date.now();
  listeners.forEach((listener) => listener());
};

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', markTouched, true);
  window.addEventListener('keydown', markTouched, true);
}

/** Whether anyone is looking: a locked phone hides the page, and the page is untouched until its first press or key. */
export const readPresence = (): Presence => ({
  isHidden: document.visibilityState === 'hidden',
  isUntouched: state.isUntouched,
});

/** When the page was last pressed or keyed (0 before the first), for a line that waits for the person's first touch after it was said. */
export const readLastTouchAt = () => state.lastTouchAt;

export const subscribeTouch = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
