import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { auth } from '@lib/firebase/config';

const pending = { isStayingOnPage: false };

const keepingPage = async (change: () => Promise<unknown>) => {
  pending.isStayingOnPage = true;
  await change().catch((error: unknown) => {
    pending.isStayingOnPage = false;
    throw error;
  });
};

/** Signs out and keeps the page open, where every other sign-out lands on Home. Emulator account switcher only. */
export async function signOutInPlace() {
  if (!auth.currentUser) return;
  await keepingPage(() => signOut(auth));
}

/** Signs in to a fixture and keeps the page open, where every other switch of account lands on Home. Emulator account switcher only. */
export async function signInInPlace(email: string, password: string) {
  const isSwitching = Boolean(auth.currentUser && auth.currentUser.email !== email);
  if (!isSwitching) {
    await signInWithEmailAndPassword(auth, email, password);
    return;
  }
  await keepingPage(() => signInWithEmailAndPassword(auth, email, password));
}

/** Whether the sign-out or switch being handled asked to keep the page open; it answers once. */
export function takeInPlaceAuthChange() {
  const isStayingOnPage = pending.isStayingOnPage;
  pending.isStayingOnPage = false;
  return isStayingOnPage;
}
