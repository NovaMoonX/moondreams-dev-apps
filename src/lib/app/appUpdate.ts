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

const UPDATE_ATTEMPT_KEY = 'updateToLatestAttempt';
const UPDATE_RETRY_WINDOW_MS = 2 * 60 * 1000;
const NEW_WORKER_WAIT_MS = 10 * 1000;

const readUpdateAttempt = () => {
  try {
    const raw = window.sessionStorage.getItem(UPDATE_ATTEMPT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const result =
      parsed && typeof parsed === 'object' && 'version' in parsed && 'at' in parsed
        ? (parsed as { version: string; at: number })
        : null;
    return result;
  } catch {
    return null;
  }
};

const writeUpdateAttempt = (version: string) => {
  try {
    window.sessionStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify({ version, at: Date.now() }));
  } catch {
    // A refused write only means a second tap repeats the gentle path first.
  }
};

// Resolves true once a newer worker controls the page, so the reload is served the new build. A page
// with no worker yet is only being claimed by the one it already has, which proves nothing.
const waitForNewWorker = async () => {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return false;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!registration) return false;

  const took = { over: false };
  const controller = new AbortController();
  const tookOver = new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      controller.abort();
      resolve(took.over);
    }, NEW_WORKER_WAIT_MS);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        took.over = true;
        window.clearTimeout(timer);
        controller.abort();
        resolve(true);
      },
      { signal: controller.signal },
    );
  });
  await registration.update().catch(() => undefined);
  if (!registration.installing && !registration.waiting) {
    if (!took.over) controller.abort();
    return took.over;
  }
  return tookOver;
};

// Only the worker's precache: the voice models and cached photos live in other caches and stay.
const clearPrecache = async () => {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith('workbox-precache')).map((name) => caches.delete(name)),
  );
};

/**
 * Loads the newest build when the person asks for it: the worker's own update when it has one, and
 * otherwise (or on a second try for the same version) the old build's cached files are dropped so the
 * reload comes from the network. Never runs on its own. Resolves false when the device went offline first.
 */
export async function updateToLatest(latestVersion: string) {
  const previous = readUpdateAttempt();
  const isRetry =
    previous?.version === latestVersion && Date.now() - previous.at < UPDATE_RETRY_WINDOW_MS;
  writeUpdateAttempt(latestVersion);

  const needsFreshFiles = async () => {
    if (isRetry) return true;
    if (isUpdateReady) return false;
    const hasNewWorker = await waitForNewWorker();
    return !hasNewWorker;
  };

  const isFresh = await needsFreshFiles();
  // The connection can drop during the wait; reloading then would land on the browser's offline page.
  if (!navigator.onLine) return false;
  if (isFresh) await clearPrecache().catch(() => undefined);
  window.location.reload();
  return true;
}
