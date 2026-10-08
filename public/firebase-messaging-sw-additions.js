// Merged into the Workbox-generated service worker via `workbox.importScripts`
// in vite.config.ts, rather than registered as its own separate service
// worker — every mini-app's manifest (public/manifest-*.json) shares that one
// worker at scope "/", and a second worker would fight it for control.
// An unreachable host must not throw here: the worker's setup, including skipWaiting, runs after this file, so a throw would leave an update stuck waiting.
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js',
  );
} catch (error) {
  console.error('Firebase Messaging scripts failed to load; push notifications disabled.', error);
}

// A throw here aborts the rest of the worker's setup (precache and runtime caching),
// so a missing or broken config must only disable push, never offline support.
if (self.__FIREBASE_CONFIG__?.projectId) {
  try {
    firebase.initializeApp(self.__FIREBASE_CONFIG__);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const { title, body } = payload.notification ?? {};

      if (!title) {
        return;
      }

      self.registration.showNotification(title, { body });
    });
  } catch (error) {
    console.error('Firebase Messaging setup failed; push notifications disabled.', error);
  }
}
