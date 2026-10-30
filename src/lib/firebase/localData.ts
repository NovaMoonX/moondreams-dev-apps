import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';

import { db, isUsingFirebaseEmulators } from './config';

const RESET_CHANNEL = 'firestore-local-reset';
const CLEAR_TIMEOUT_MS = 3000;
const CACHE_OWNER_KEY = 'firestore-cache-owner';
const SIGNED_OUT_OWNER = 'signed-out';

function readCacheOwner() {
  try {
    return window.localStorage.getItem(CACHE_OWNER_KEY);
  } catch {
    return null;
  }
}

/** Whether the owner was recorded; without storage the copy can't be tied to an account, and Reset saved data still clears it. */
function writeCacheOwner(owner: string) {
  try {
    window.localStorage.setItem(CACHE_OWNER_KEY, owner);
    return window.localStorage.getItem(CACHE_OWNER_KEY) === owner;
  } catch {
    return false;
  }
}

/**
 * Records that Firestore's saved copy belongs to this account, and says whether it was kept for
 * someone else (another account, or a signed-out visit since a sign-out) and must be cleared first.
 */
export function claimFirestoreLocalData(uid: string) {
  if (isUsingFirebaseEmulators) return false;
  const owner = readCacheOwner();
  if (owner === uid) return false;
  // Clearing reloads the page, so it only happens once the new owner is recorded, or it would never stop.
  return writeCacheOwner(uid) && owner !== null;
}

/** Marks the saved copy as no longer any account's, so the next sign-in starts from a clean one. */
export function releaseFirestoreLocalData() {
  writeCacheOwner(SIGNED_OUT_OWNER);
}

/** Reloads this tab when another tab resets Firestore's saved data, which stops Firestore in every tab. */
export function reloadOnFirestoreReset() {
  if (typeof BroadcastChannel === 'undefined') return;
  new BroadcastChannel(RESET_CHANNEL).onmessage = () => window.location.reload();
}

/** Stops Firestore and deletes the data this device saved for it, asking other tabs to reload; the caller must reload too. */
export async function clearFirestoreLocalData() {
  await terminate(db).catch(() => undefined);
  // A tab holding the database open can stall the delete, so don't wait on it forever.
  await Promise.race([
    clearIndexedDbPersistence(db).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, CLEAR_TIMEOUT_MS)),
  ]);
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(RESET_CHANNEL);
    channel.postMessage('reset');
    channel.close();
  }
}

/** Clears the Firestore data this device saves and reloads every open tab; nothing on the server changes. */
export async function resetFirestoreLocalData() {
  await clearFirestoreLocalData();
  window.location.reload();
}
