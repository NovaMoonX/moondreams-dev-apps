import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAppSelector } from '@/store';
import {
  LINK_BANKS_GATE_ID,
  RETURN_PULL_AFTER_MS,
} from '@apps/runway/constants';
import { syncLinks } from '@apps/runway/store/actions/linkActions';

const pull = { uid: '', startedAt: 0, isRunning: false };

/** Asks the banks for what is new when the app opens or comes back to the front after 15 minutes or more, quietly: nothing is shown on success or failure. */
export function useSyncOnReturn() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isGateOpen = useIsGateOpen('runway', LINK_BANKS_GATE_ID);
  const hasActiveLink = useAppSelector((state) =>
    state.runway.links.some((link) => link.status === 'active'),
  );
  const lastSyncAt = useAppSelector((state) =>
    state.runway.links.reduce(
      (latest, link) => Math.max(latest, link.lastSyncAt ?? 0),
      0,
    ),
  );
  const isEnabled = uid !== null && isGateOpen && hasActiveLink;

  useEffect(() => {
    if (!isEnabled) return;

    const pullIfStale = () => {
      if (document.visibilityState !== 'visible' || pull.isRunning) return;
      const lastStart = pull.uid === uid ? pull.startedAt : 0;
      if (Date.now() - Math.max(lastStart, lastSyncAt) < RETURN_PULL_AFTER_MS)
        return;
      pull.uid = uid;
      pull.startedAt = Date.now();
      pull.isRunning = true;
      syncLinks()
        .catch((error: unknown) =>
          console.error('The return refresh did not run', error),
        )
        .finally(() => {
          pull.isRunning = false;
        });
    };

    pullIfStale();
    document.addEventListener('visibilitychange', pullIfStale);
    return () => document.removeEventListener('visibilitychange', pullIfStale);
  }, [isEnabled, uid, lastSyncAt]);
}
