import { IS_INSTALLED_APP } from '@utils/pwaUtils';

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

const listeners = new Set<() => void>();
let isUpdateReady = false;

export function subscribeToUpdateReady(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getIsUpdateReady() {
  return isUpdateReady;
}

/**
 * Installed apps stay alive in the background and rarely navigate, so the browser's own update
 * check seldom runs. Re-check on resume, on reconnecting and every 15 minutes; a worker that takes over a page that was
 * loaded under an older one means this page's code is stale. Installed apps only.
 */
export function watchForAppUpdates() {
  if (!IS_INSTALLED_APP || !('serviceWorker' in navigator)) return;

  // A page loaded with no worker (first visit, hard reload) is claimed once; that claim replaces nothing.
  let isClaimed = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isClaimed) {
      isClaimed = true;
      return;
    }
    isUpdateReady = true;
    listeners.forEach((listener) => listener());
  });

  void navigator.serviceWorker.ready.then((registration) => {
    const checkForUpdate = () => {
      registration.update().catch(() => undefined);
    };
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  });
}
