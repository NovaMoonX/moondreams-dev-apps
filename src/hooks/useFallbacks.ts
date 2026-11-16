import { useSyncExternalStore } from 'react';

import {
  dismissFallback,
  readFallbacks,
  subscribeFallbacks,
} from '@/lib/fallbacks/fallbacks';

/** The fallbacks in play right now (newest first, dismissed ones left out) and how to dismiss one for the session. */
export function useFallbacks() {
  const fallbacks = useSyncExternalStore(
    subscribeFallbacks,
    readFallbacks,
    readFallbacks,
  );
  return { fallbacks, dismiss: dismissFallback };
}
