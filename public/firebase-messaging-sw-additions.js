// Merged into the Workbox-generated service worker via `workbox.importScripts`
// in vite.config.ts, rather than registered as its own separate service
// worker — every mini-app's manifest (public/manifest-*.json) shares that one
// worker at scope "/", and a second worker would fight it for control.
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts(
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js',
);

if (self.__FIREBASE_CONFIG__) {
  firebase.initializeApp(self.__FIREBASE_CONFIG__);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification ?? {};

    if (!title) {
      return;
    }

    self.registration.showNotification(title, { body });
  });
}
