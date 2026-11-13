import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAppSelector } from '@/store';
import {
  FRESH_ASK_EVERY_MS,
  FRESH_ASK_GAP_MS,
  LINK_BANKS_GATE_ID,
} from '@apps/runway/constants';
import { syncLinks } from '@apps/runway/store/actions/linkActions';

const ask = { uid: '', startedAt: 0, isRunning: false };

/** Asks the banks for their latest figures when the app opens, whenever it comes back to the front and every few minutes while it stays there (a bank waiting on a sign-in included, so one that is back clears), quietly: nothing is shown on success or failure. */
export function useSyncOnReturn() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isGateOpen = useIsGateOpen('runway', LINK_BANKS_GATE_ID);
  const hasSyncableLink = useAppSelector((state) =>
    state.runway.links.some(
      (link) => link.status === 'active' || link.status === 'needsAttention',
    ),
  );
  const isEnabled = uid !== null && isGateOpen && hasSyncableLink;

  useEffect(() => {
    if (!isEnabled) return;

    const askFresh = () => {
      if (document.visibilityState !== 'visible' || ask.isRunning) return;
      const lastStart = ask.uid === uid ? ask.startedAt : 0;
      if (Date.now() - lastStart < FRESH_ASK_GAP_MS) return;
      ask.uid = uid;
      ask.startedAt = Date.now();
      ask.isRunning = true;
      syncLinks({ fresh: true })
        .catch((error: unknown) =>
          console.error('The fresh balance ask did not run', error),
        )
        .finally(() => {
          ask.isRunning = false;
        });
    };

    askFresh();
    document.addEventListener('visibilitychange', askFresh);
    const intervalId = window.setInterval(askFresh, FRESH_ASK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', askFresh);
      window.clearInterval(intervalId);
    };
  }, [isEnabled, uid]);
}
