import { useEffect, useRef, type ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import {
  getValuesHiddenKey,
  hideValues,
  ValuesHiddenKeyContext,
} from '@/hooks/useValuesHidden';

const AWAY_LIMIT_MS = 5 * 60 * 1000;

interface ValuesHiddenProviderProps {
  /** Scopes the choice, so one app's eye never changes another's. */
  scopeId: string;
  children: ReactNode;
}

/** Mount once around the screens that blur their figures. The choice is kept per device and per signed-in account, and the figures hide again after the page has been in the background for five minutes. */
function ValuesHiddenProvider({
  scopeId,
  children,
}: ValuesHiddenProviderProps) {
  const { user } = useAuth();
  const key = getValuesHiddenKey(scopeId, user?.uid ?? null);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    const note = () => {
      leftAt.current ??= Date.now();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') note();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', note);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', note);
    };
  }, []);

  useOnTabReturn(() => {
    const away = leftAt.current;
    leftAt.current = null;
    if (away !== null && Date.now() - away >= AWAY_LIMIT_MS) hideValues(key);
  });

  return (
    <ValuesHiddenKeyContext.Provider value={key}>
      {children}
    </ValuesHiddenKeyContext.Provider>
  );
}

export default ValuesHiddenProvider;
