import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { app } from '@/lib/firebase/config';

/**
 * Requests notification permission and returns an FCM device token, or
 * `null` if permission was denied or push isn't supported in this browser.
 *
 * Reuses the single origin-wide service worker registered in `main.tsx`
 * (shared by every mini-app's manifest) rather than registering a second
 * one — see vite.config.ts's `workbox.importScripts` for how that worker
 * gets its Firebase Messaging background handler.
 */
export async function requestPushPermission(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !(await isSupported())) {
    return null;
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  try {
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch {
    return null;
  }
}
