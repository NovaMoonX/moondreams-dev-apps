import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  signOut,
  type User,
} from 'firebase/auth';

import { app, emulatorAuthOrigin } from '@lib/firebase/config';

const APP_PREFIX = 'account-session:';

const sessions = new Map<string, { auth: Auth; ready: Promise<void> }>();

function openSession(uid: string) {
  const existing = sessions.get(uid);
  if (existing) return existing;
  const name = `${APP_PREFIX}${uid}`;
  const sessionApp = getApps().some((entry) => entry.name === name)
    ? getApp(name)
    : initializeApp(app.options, name);
  // Its own persistence, and no popup resolver: this copy only ever holds a session, it never signs in.
  const auth = initializeAuth(sessionApp, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  if (emulatorAuthOrigin) connectAuthEmulator(auth, emulatorAuthOrigin, { disableWarnings: true });
  const session = { auth, ready: auth.authStateReady() };
  sessions.set(uid, session);
  return session;
}

/** Loads the kept sessions of these accounts, so a later tap can tell at once which can switch without Google. */
export function loadAccountSessions(uids: string[]) {
  uids.forEach(openSession);
}

/** Keeps a copy of this signed-in account's session on the device, so switching back to it needs no Google sign-in. */
export async function keepAccountSession(user: User) {
  const { auth, ready } = openSession(user.uid);
  await ready;
  if (auth.currentUser?.uid === user.uid) return;
  await auth.updateCurrentUser(user);
}

/** The kept session for this account when it has loaded, else `null`; synchronous so a tap can still open Google's popup in time. */
export function getKeptSession(uid: string) {
  const user = sessions.get(uid)?.auth.currentUser ?? null;
  return user?.uid === uid ? user : null;
}

/** Ends this account's kept session on the device; the next switch to it goes through Google. */
export async function dropAccountSession(uid: string) {
  const session = openSession(uid);
  sessions.delete(uid);
  await session.ready.catch(() => undefined);
  await signOut(session.auth).catch(() => undefined);
  await deleteApp(session.auth.app).catch(() => undefined);
}
