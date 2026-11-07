import { useEffect, useRef, type ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { setSiteNotice } from '@/hooks/useSiteNotice';
import {
  endMadeUpValues,
  getValuesHiddenKey,
  hideValues,
  useScrambleSeed,
  ValuesHiddenKeyContext,
} from '@/hooks/useValuesHidden';
import { setMoneyScramble } from '@/utils/moneyScramble';

const AWAY_LIMIT_MS = 5 * 60 * 1000;
const MADE_UP_NOTICE = 'Made-up amounts are on';
const TURN_OFF = 'Turn off';

interface ValuesHiddenProviderProps {
  /** Scopes the choice, so one app's eye never changes another's. */
  scopeId: string;
  children: ReactNode;
}

/** Mount once around the screens that mask their figures. The choice is kept per device and per signed-in account, and shown figures hide again after the page has been in the background for five minutes. While made-up amounts are on, every money formatter under it gives made-up figures; screens that cache formatted text remount when that changes, and the site's top strip says so with a way to turn it off. */
function ValuesHiddenProvider({
  scopeId,
  children,
}: ValuesHiddenProviderProps) {
  const { user } = useAuth();
  const key = getValuesHiddenKey(scopeId, user?.uid ?? null);
  const leftAt = useRef<number | null>(null);
  const seed = useScrambleSeed(key);
  // Set during render, not in an effect, so the screens under it format with it from their first render.
  setMoneyScramble(seed);

  useEffect(() => {
    setMoneyScramble(seed);
    return () => setMoneyScramble(null);
  }, [seed]);

  useEffect(() => {
    if (seed === null) return;
    setSiteNotice({
      label: MADE_UP_NOTICE,
      actionLabel: TURN_OFF,
      onAction: () => endMadeUpValues(key),
    });
    return () => setSiteNotice(null);
  }, [seed, key]);

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
