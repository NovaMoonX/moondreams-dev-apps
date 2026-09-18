import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { qrcode } from 'vite-plugin-qrcode';

// Every mini-app installs as its own PWA (see public/manifest-*.json), but
// they all share one Workbox service worker at scope "/" (see src/main.tsx).
// Registering a second, separate service worker for Firebase Cloud Messaging
// would fight that one for control of the origin, so FCM's background
// message handler is merged into the same worker via `workbox.importScripts`
// instead. This plugin writes the Firebase web config (not secret — same
// values already shipped in the client bundle) into the build output so the
// imported script can call `firebase.initializeApp` without needing its own
// env injection at runtime.
function firebaseMessagingSwConfig(): Plugin {
  return {
    name: 'firebase-messaging-sw-config',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const config = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.VITE_FIREBASE_APP_ID,
      };

      fs.writeFileSync(
        path.resolve(outDir, 'firebase-messaging-sw-config.js'),
        `self.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};\n`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    qrcode(),
    firebaseMessagingSwConfig(),
    VitePWA({
      injectRegister: null, // Handles registration manually
      manifest: false, // Disables auto single-manifest injection
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        importScripts: [
          'firebase-messaging-sw-config.js',
          'firebase-messaging-sw-additions.js',
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@apps': path.resolve(import.meta.dirname, './src/apps'),
      '@components': path.resolve(import.meta.dirname, './src/components'),
      '@contexts': path.resolve(import.meta.dirname, './src/contexts'),
      '@hooks': path.resolve(import.meta.dirname, './src/hooks'),
      '@lib': path.resolve(import.meta.dirname, './src/lib'),
      '@routes': path.resolve(import.meta.dirname, './src/routes'),
      '@screens': path.resolve(import.meta.dirname, './src/screens'),
      '@store': path.resolve(import.meta.dirname, './src/store'),
      '@styles': path.resolve(import.meta.dirname, './src/styles'),
      '@ui': path.resolve(import.meta.dirname, './src/ui'),
      '@utils': path.resolve(import.meta.dirname, './src/utils'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // in KB. 1000 - 1500 is good for most apps.
  },
});
