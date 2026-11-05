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

/** Raises the top strip's "New version ready · Restart"; the page itself never reloads on its own. */
export function markUpdateReady() {
  if (isUpdateReady) return;
  isUpdateReady = true;
  listeners.forEach((listener) => listener());
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
    markUpdateReady();
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

const STALE_CHUNK_RELOAD_KEY = 'staleChunkReloadAt';
const STALE_CHUNK_RELOAD_WINDOW_MS = 30 * 1000;
// Chrome, Firefox and Safari word a failed `import()` differently; a CSS preload failing is the same cause.
const STALE_CHUNK_MESSAGE =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** Whether an error is a lazy screen's file failing to load, which after a deploy means this page runs an older version. */
export function isStaleChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const result = STALE_CHUNK_MESSAGE.test(message);
  return result;
}

const readLastReload = () => {
  try {
    return Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

// A store that reads but refuses writes (full) would leave the screen on Loading, since the reload never happens.
const canWriteStamp = () => {
  try {
    window.sessionStorage.setItem(`${STALE_CHUNK_RELOAD_KEY}:probe`, '1');
    window.sessionStorage.removeItem(`${STALE_CHUNK_RELOAD_KEY}:probe`);
    return true;
  } catch {
    return false;
  }
};

/** Whether a missing lazy file may reload the page into the new version: online, and not already tried in the last half minute (then it is a real fault). */
export function canReloadForStaleChunk() {
  const result =
    navigator.onLine &&
    Date.now() - readLastReload() >= STALE_CHUNK_RELOAD_WINDOW_MS &&
    canWriteStamp();
  return result;
}

/** Reloads into the new version, noting when so a page that still can't load its files is not reloaded again. */
export function reloadForStaleChunk() {
  try {
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}
