// TEMPORARY: on-screen diagnostics for one account. Remove with DebugPanel.
import { useSyncExternalStore } from 'react';

export const A_LIST_DEBUG_EMAIL = 'stephon.ricks.01@gmail.com';

const MAX_ENTRIES = 40;
const listeners = new Set<() => void>();
let entries: string[] = [];

export function logAListDebug(message: string) {
  const time = new Date().toISOString().slice(11, 23);
  entries = [...entries, `${time} ${message}`].slice(-MAX_ENTRIES);
  console.log('[a-list-debug]', message);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAListDebugEntries() {
  return useSyncExternalStore(subscribe, () => entries);
}

export async function runServerCheck(uid: string) {
  const { doc, getDocFromCache, getDocFromServer } = await import('firebase/firestore');
  const { auth, db } = await import('@/lib/firebase/config');
  const current = auth.currentUser;
  const token = await current?.getIdTokenResult().catch(() => null);
  logAListDebug(
    `auth uid=${current?.uid} provider=${token?.signInProvider} providers=${current?.providerData.map((p) => p.providerId).join(',')}`,
  );

  const registrations = await navigator.serviceWorker
    ?.getRegistrations()
    .catch(() => []);
  const connection = (navigator as { connection?: { effectiveType?: string } }).connection;
  logAListDebug(
    `device net=${connection?.effectiveType} swController=${Boolean(navigator.serviceWorker?.controller)} swRegs=${registrations?.length} ua=${navigator.userAgent}`,
  );

  const restUrl = `https://firestore.googleapis.com/v1/projects/${db.app.options.projectId}/databases/(default)/documents/apps/a-list/memberships/${uid}`;
  const idToken = await current?.getIdToken().catch(() => null);
  const restTimeout = AbortSignal.timeout(8000);
  fetch(restUrl, { headers: { Authorization: `Bearer ${idToken}` }, signal: restTimeout })
    .then((response) => logAListDebug(`REST membership status=${response.status}`))
    .catch((error) => logAListDebug(`REST membership FAILED ${(error as Error).name}`));

  await getDocFromCache(doc(db, 'apps', 'a-list', 'memberships', uid))
    .then((snapshot) => logAListDebug(`cache get exists=${snapshot.exists()}`))
    .catch((error) => logAListDebug(`cache get none (${(error as { code?: string }).code})`));

  const paths = [
    ['apps', 'a-list', 'memberships', uid],
    ['users', uid],
  ] as const;
  await Promise.all(
    paths.map(async (segments) => {
      const [first, ...rest] = segments;
      const path = segments.join('/');
      try {
        const pending = setTimeout(() => logAListDebug(`server get ${path} still pending after 8s`), 8000);
        const snapshot = await getDocFromServer(doc(db, first, ...rest)).finally(() => clearTimeout(pending));
        logAListDebug(`server get ${path} exists=${snapshot.exists()}`);
      } catch (error) {
        logAListDebug(`server get ${path} ERROR ${(error as { code?: string }).code}`);
      }
    }),
  );
}

export async function resetFirestoreCache() {
  const { clearIndexedDbPersistence, terminate } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase/config');
  await terminate(db).catch(() => undefined);
  await clearIndexedDbPersistence(db).catch((error) =>
    logAListDebug(`clear cache ERROR ${(error as { code?: string }).code}`),
  );
  window.location.reload();
}
