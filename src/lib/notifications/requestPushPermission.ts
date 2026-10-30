import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { app } from '@/lib/firebase/config';

/** What the browser answered when asked for notifications, or `null` where push isn't supported. A person is never timed out of this: it waits for them. */
export async function askNotificationPermission(): Promise<NotificationPermission | null> {
  if (!('serviceWorker' in navigator) || !(await isSupported())) {
    return null;
  }

  return Notification.requestPermission();
}

/**
 * Returns this device's FCM token, or `null` if it can't be had. Only call it where permission is
 * already granted.
 *
 * Reuses the single origin-wide service worker registered in `main.tsx`
 * (shared by every app's manifest) rather than registering a second
 * one — see vite.config.ts's `workbox.importScripts` for how that worker
 * gets its Firebase Messaging background handler.
 */
export async function getDeviceToken(): Promise<string | null> {
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

/** Requests notification permission and returns an FCM device token, or `null` if permission was denied or push isn't supported in this browser. */
export async function requestPushPermission(): Promise<string | null> {
  const permission = await askNotificationPermission();

  return permission === 'granted' ? getDeviceToken() : null;
}
