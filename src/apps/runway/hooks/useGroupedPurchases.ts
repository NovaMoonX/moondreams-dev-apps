import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startGroupedPurchasesListener } from '@apps/runway/store/listeners/purchaseListeners';
import type { OpenPurchase } from '@apps/runway/types';

interface GroupedPurchasesState {
  purchases: OpenPurchase[] | null;
  isFailed: boolean;
}

/** Every purchase that belongs to an expense group across all dates, newest first, read while `isEnabled`; `purchases` is null until they are read. */
export function useGroupedPurchases(isEnabled: boolean) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<GroupedPurchasesState>({
    purchases: null,
    isFailed: false,
  });

  useEffect(() => {
    if (!uid || !isEnabled) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startGroupedPurchasesListener(
          uid,
          encryption,
          (purchases) => setState({ purchases, isFailed: false }),
          (error) => {
            console.error('The groups did not open', error);
            setState({ purchases: null, isFailed: true });
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) setState({ purchases: null, isFailed: true });
      });
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, isEnabled]);

  return {
    purchases: state.purchases
      ? [...state.purchases].sort(
          (a, b) => b.date - a.date || b.createdAt - a.createdAt,
        )
      : null,
    isFailed: state.isFailed,
  };
}
