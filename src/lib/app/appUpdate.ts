import { IS_INSTALLED_APP } from '@utils/pwaUtils';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
 * check seldom runs. Re-check on resume and hourly; a worker that takes over a page that was
 * loaded under an older one means this page's code is stale. Installed apps only.
 */
export function watchForAppUpdates() {
  if (!IS_INSTALLED_APP || !('serviceWorker' in navigator)) return;

  // The first-ever install also fires `controllerchange`, with nothing stale to replace.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    isUpdateReady = true;
    listeners.forEach((listener) => listener());
  });

  void navigator.serviceWorker.ready.then((registration) => {
    const checkForUpdate = () => {
      registration.update().catch(() => undefined);
    };
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  });
}
