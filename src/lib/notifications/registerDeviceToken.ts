import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

const tokenKey = (uid: string) => `push-token:${uid}`;

/** The token this device registered for the person, kept so signing out can take it off their account without first asking the browser's push service for it, which may not answer. */
export function readRememberedToken(uid: string): string | null {
  try {
    return localStorage.getItem(tokenKey(uid));
  } catch {
    return null;
  }
}

function rememberToken(uid: string, token: string) {
  try {
    localStorage.setItem(tokenKey(uid), token);
  } catch {
    // Without storage, signing out asks the browser for the token instead.
  }
}

function forgetToken(uid: string) {
  try {
    localStorage.removeItem(tokenKey(uid));
  } catch {
    // Nothing was kept to forget.
  }
}

/** Adds an FCM device token to `users/{uid}.fcmTokens`, deduped by Firestore's `arrayUnion`. The token is remembered first, so a write that lands later is still one sign-out can undo. */
export async function registerDeviceToken(
  uid: string,
  token: string,
): Promise<void> {
  rememberToken(uid, token);
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayUnion(token),
  });
}

/** Removes one device's FCM token from `users/{uid}.fcmTokens`, so pushes stop going to it. */
export async function unregisterDeviceToken(
  uid: string,
  token: string,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayRemove(token),
  });
  forgetToken(uid);
}
