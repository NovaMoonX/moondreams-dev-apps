import { useEffect } from 'react';

import { restartFirestoreConnection } from '@/lib/firebase/syncWatchdog';

const AWAY_LONG_ENOUGH_MS = 10_000;

/** Restarts the live Firestore connection when the page comes back to the front after being hidden a while, so its listeners catch up at once rather than on a socket the phone left stale. */
export function useFreshListenersOnReturn(isEnabled = true) {
  useEffect(() => {
    if (!isEnabled) return;
    const away = {
      since: document.visibilityState === 'hidden' ? Date.now() : 0,
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        away.since = Date.now();
        return;
      }
      const wasAwayFor = away.since === 0 ? 0 : Date.now() - away.since;
      away.since = 0;
      if (wasAwayFor < AWAY_LONG_ENOUGH_MS || !navigator.onLine) return;
      restartFirestoreConnection().catch((error: unknown) =>
        console.error('The Firestore connection could not be restarted', error),
      );
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [isEnabled]);
}
