import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { markUpdateReady, watchForAppUpdates } from './lib/app/appUpdate';
import { reloadOnFirestoreReset } from './lib/firebase/localData';
import { installVersionPeek } from './lib/app/versionPeek';
import { IS_INSTALLED_APP } from '@utils/pwaUtils';
import './index.css';

// Ensures a single Service Worker handles caching for the entire origin,
// which installs as one app through manifest-main.json
registerSW({ immediate: true });
document.documentElement.toggleAttribute('data-installed-app', IS_INSTALLED_APP);
watchForAppUpdates();

// A tab opened before a deploy can't fetch the new build's lazy chunks; offer Restart, never reload for them. Offline is not a new version.
window.addEventListener('vite:preloadError', () => {
  if (navigator.onLine) markUpdateReady();
});
installVersionPeek();
reloadOnFirestoreReset();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
