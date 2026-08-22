import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Ensures a single Service Worker handles caching for the entire origin
// while the browser uses the dynamically assigned manifest in Layout.tsx
// to match the user's active sub-route (/app-a, /app-b) when triggering 
// the "Add to Home Screen" prompt
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
