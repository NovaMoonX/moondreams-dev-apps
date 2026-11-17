import { disableNetwork, enableNetwork } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { clearFallback, reportFallback } from '@/lib/fallbacks/fallbacks';

/** How long a write the server accepted may take to reach the listeners before the connection is restarted. */
export const LISTENER_CATCH_UP_MS = 4_000;
const CHECK_EVERY_MS = 250;
const AFTER_RESTART_MS = 10_000;
const RESTART_GAP_MS = 30_000;
const FALLBACK_KEY = 'firestore-listener-stalled';

const connection = { restarting: null as Promise<void> | null, lastAt: 0 };

/** Restarts the device's Firestore connection, once at a time and at most every 30 seconds. */
export const restartFirestoreConnection = (): Promise<void> => {
  if (connection.restarting !== null) return connection.restarting;
  if (Date.now() - connection.lastAt < RESTART_GAP_MS) return Promise.resolve();
  connection.lastAt = Date.now();
  connection.restarting = disableNetwork(db)
    .then(() => enableNetwork(db))
    .finally(() => {
      connection.restarting = null;
    });
  return connection.restarting;
};

const waitUntil = (hasLanded: () => boolean, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (hasLanded()) return resolve(true);
      if (Date.now() - startedAt >= ms) return resolve(false);
      setTimeout(check, CHECK_EVERY_MS);
    };
    check();
  });

export interface WriteLandedWatch {
  /** The app or feature, for debug viewers. */
  feature: string;
  /** What was written, in a few words with no names or amounts ("a move of money"). */
  what: string;
  /** Whether the screen's listeners now show the write. */
  hasLanded: () => boolean;
}

/**
 * After a write the server accepted, waits for the listeners to show it; when they don't within a few
 * seconds the live connection has stalled, so it is restarted and debug viewers are told.
 */
export async function watchWriteLanded({
  feature,
  what,
  hasLanded,
}: WriteLandedWatch): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (await waitUntil(hasLanded, LISTENER_CATCH_UP_MS)) return;
  const waited = `${LISTENER_CATCH_UP_MS / 1000} s`;
  reportFallback({
    key: FALLBACK_KEY,
    feature,
    wanted: 'Live updates from the server',
    used: 'A restart of the connection',
    reason: `The server saved ${what}, but the screen had not heard about it after ${waited}.`,
    cause: { stage: 'listener catch-up', detail: `no snapshot within ${waited}` },
    facts: [
      `visibility: ${typeof document === 'undefined' ? 'unknown' : document.visibilityState}`,
    ],
  });
  await restartFirestoreConnection().catch((error: unknown) =>
    console.error('The Firestore connection could not be restarted', error),
  );
  if (await waitUntil(hasLanded, AFTER_RESTART_MS)) {
    clearFallback(FALLBACK_KEY);
    return;
  }
  reportFallback({
    key: FALLBACK_KEY,
    feature,
    wanted: 'Live updates from the server',
    used: 'The last data the screen had',
    reason: `The server saved ${what}, and the screen still had not heard about it after a restart.`,
    cause: { stage: 'listener catch-up', detail: 'no snapshot after a restart' },
  });
}
