import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

/** Adds an FCM device token to `users/{uid}.fcmTokens`, deduped by Firestore's `arrayUnion`. */
export async function registerDeviceToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayUnion(token),
  });
}

/** Removes one device's FCM token from `users/{uid}.fcmTokens`, so pushes stop going to it. */
export async function unregisterDeviceToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayRemove(token),
  });
}
