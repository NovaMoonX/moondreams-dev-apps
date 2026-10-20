// Merged into the Workbox-generated service worker via `workbox.importScripts`
// in vite.config.ts, rather than registered as its own separate service
// worker — the installed site shares that one worker at scope "/", and a
// second worker would fight it for control.
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

    // Creating the instance is what registers the push listener. It shows a notification payload
    // itself and opens its link on tap; showing it here too made two, and a hand-made one has no link.
    firebase.messaging();
  } catch (error) {
    console.error('Firebase Messaging setup failed; push notifications disabled.', error);
  }
}
