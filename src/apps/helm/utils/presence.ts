import type { Presence } from '@apps/helm/utils/privacy';

const state = { isUntouched: true };

const markTouched = () => {
  state.isUntouched = false;
  window.removeEventListener('pointerdown', markTouched, true);
  window.removeEventListener('keydown', markTouched, true);
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
