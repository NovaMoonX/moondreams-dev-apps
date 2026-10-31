import { signOut } from 'firebase/auth';

import { auth } from '@lib/firebase/config';

const pending = { isStayingOnPage: false };

/** Signs out and keeps the page open, where every other sign-out lands on Home. Emulator account switcher only. */
export async function signOutInPlace() {
  pending.isStayingOnPage = true;
  await signOut(auth).catch((error) => {
    pending.isStayingOnPage = false;
    throw error;
  });
}

/** Whether the sign-out being handled asked to keep the page open; it answers once. */
export function takeInPlaceSignOut() {
  const isStayingOnPage = pending.isStayingOnPage;
  pending.isStayingOnPage = false;
  return isStayingOnPage;
}
