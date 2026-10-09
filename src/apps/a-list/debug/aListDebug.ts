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
  const { doc, getDocFromServer } = await import('firebase/firestore');
  const { auth, db } = await import('@/lib/firebase/config');
  const current = auth.currentUser;
  const token = await current?.getIdTokenResult().catch(() => null);
  logAListDebug(
    `auth uid=${current?.uid} provider=${token?.signInProvider} providers=${current?.providerData.map((p) => p.providerId).join(',')}`,
  );

  const paths = [
    ['apps', 'a-list', 'memberships', uid],
    ['users', uid],
  ] as const;
  await Promise.all(
    paths.map(async (segments) => {
      const [first, ...rest] = segments;
      const path = segments.join('/');
      try {
        const snapshot = await getDocFromServer(doc(db, first, ...rest));
        logAListDebug(`server get ${path} exists=${snapshot.exists()}`);
      } catch (error) {
        logAListDebug(`server get ${path} ERROR ${(error as { code?: string }).code}`);
      }
    }),
  );
}
