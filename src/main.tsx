import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { watchForAppUpdates } from './lib/app/appUpdate';
import { installVersionPeek } from './lib/app/versionPeek';
import { IS_INSTALLED_APP } from '@utils/pwaUtils';
import './index.css';

// Ensures a single Service Worker handles caching for the entire origin
// while the browser uses the dynamically assigned manifest in Layout.tsx
// to match the user's active sub-route (/app-a, /app-b) when triggering 
// the "Add to Home Screen" prompt
registerSW({ immediate: true });
document.documentElement.toggleAttribute('data-installed-app', IS_INSTALLED_APP);
watchForAppUpdates();

// A tab opened before a deploy can't fetch the new build's lazy chunks; reload once to pick them up.
window.addEventListener('vite:preloadError', () => {
  try {
    const lastReload = Number(sessionStorage.getItem('chunk-reload-at'));
    if (Date.now() - lastReload < 30_000) return;
    sessionStorage.setItem('chunk-reload-at', String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
});
installVersionPeek();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
