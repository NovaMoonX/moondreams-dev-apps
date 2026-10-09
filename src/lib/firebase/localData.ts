import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';

import { db } from './config';

/** Clears the Firestore data this device saves and reloads; nothing on the server changes. */
export async function resetFirestoreLocalData() {
  await terminate(db).catch(() => undefined);
  await clearIndexedDbPersistence(db).catch(() => undefined);
  window.location.reload();
}
