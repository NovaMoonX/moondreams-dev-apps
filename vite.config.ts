import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { qrcode } from 'vite-plugin-qrcode';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    qrcode(),
    VitePWA({
      injectRegister: null, // Handles registration manually
      manifest: false, // Disables auto single-manifest injection
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
