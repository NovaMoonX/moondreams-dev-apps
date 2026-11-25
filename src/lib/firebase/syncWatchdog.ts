import { disableNetwork, enableNetwork } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { clearFallback, reportFallback } from '@/lib/fallbacks/fallbacks';
import { HELD_WRITE_SETTLED_MS } from '@/utils/heldWrites';

/** How long a write the server accepted may take to reach the listeners before the connection is restarted. */
export const LISTENER_CATCH_UP_MS = 4_000;
const CHECK_EVERY_MS = 250;
const AFTER_RESTART_MS = 10_000;
const PAST_HOLD_EXPIRY_MS = 250;
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

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

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
  feature: string;
  /** No names or amounts: debug viewers can copy it. */
  what: string;
  hasLanded: () => boolean;
  /** Lays the holds again, so one the list delivered past but never matched lets go on time rather than at the next delivery. */
  recheck?: () => void;
  /** Short facts for debug viewers on what still waits; never a name or an amount. */
  describe?: () => string[];
}

/** Restarts a stalled live connection when the listeners miss a write the server accepted, and tells debug viewers. */
export async function watchWriteLanded({
  feature,
  what,
  hasLanded,
  recheck,
  describe,
}: WriteLandedWatch): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const startedAt = Date.now();
  if (await waitUntil(hasLanded, LISTENER_CATCH_UP_MS)) return;
  const waited = `${LISTENER_CATCH_UP_MS / 1000} s`;
  reportFallback({
    key: FALLBACK_KEY,
    feature,
    wanted: 'Live updates from the server',
    used: 'A restart of the connection',
    reason: `The server saved ${what}, but the screen had not heard about it after ${waited}.`,
    cause: {
      stage: 'listener catch-up',
      detail: `no snapshot within ${waited}`,
    },
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
  if (recheck !== undefined) {
    await pause(
      startedAt + HELD_WRITE_SETTLED_MS + PAST_HOLD_EXPIRY_MS - Date.now(),
    );
    recheck();
    if (hasLanded()) {
      clearFallback(FALLBACK_KEY);
      return;
    }
  }
  reportFallback({
    key: FALLBACK_KEY,
    feature,
    wanted: 'Live updates from the server',
    used: 'The last data the screen had',
    reason: `The server saved ${what}, and the screen still had not heard about it after a restart.`,
    cause: {
      stage: 'listener catch-up',
      detail: 'no snapshot after a restart',
    },
    facts: describe?.() ?? [],
  });
}
