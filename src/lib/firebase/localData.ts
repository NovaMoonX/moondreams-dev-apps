import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';

import { db } from './config';

const RESET_CHANNEL = 'firestore-local-reset';
const CLEAR_TIMEOUT_MS = 3000;

/** Reloads this tab when another tab resets Firestore's saved data, which stops Firestore in every tab. */
export function reloadOnFirestoreReset() {
  if (typeof BroadcastChannel === 'undefined') return;
  new BroadcastChannel(RESET_CHANNEL).onmessage = () => window.location.reload();
}

/** Clears the Firestore data this device saves and reloads every open tab; nothing on the server changes. */
export async function resetFirestoreLocalData() {
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
  window.location.reload();
}
