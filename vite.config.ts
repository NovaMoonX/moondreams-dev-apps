import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { qrcode } from 'vite-plugin-qrcode';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss(), qrcode()],
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
  }
});
