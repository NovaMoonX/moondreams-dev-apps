import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';

import { auth, db, isUsingFirebaseEmulators } from './config';

/** Clears the Firestore data this device saves and reloads; nothing on the server changes. */
export async function resetFirestoreLocalData() {
  await terminate(db).catch(() => undefined);
  await clearIndexedDbPersistence(db).catch(() => undefined);
  window.location.reload();
}

/** Asks the backend directly, bypassing the Firestore SDK and its saved state. null when it can't tell. */
export async function checkDocExistsOnServer(path: string): Promise<boolean | null> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;

  const origin = isUsingFirebaseEmulators
    ? `http://${window.location.hostname}:8080`
    : 'https://firestore.googleapis.com';
  const url = `${origin}/v1/projects/${db.app.options.projectId}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  const result = response?.status === 200 ? true : response?.status === 404 ? false : null;
  return result;
}
