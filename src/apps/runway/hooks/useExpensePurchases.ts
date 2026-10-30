import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startExpensePurchasesListener } from '@apps/runway/store/listeners/purchaseListeners';
import type { OpenPurchase } from '@apps/runway/types';

interface ExpensePurchasesState {
  expenseId: string | null;
  purchases: OpenPurchase[] | null;
  isFailed: boolean;
}

/** Every purchase in one expense group across all dates, newest first, read for the view that shows it; `purchases` is null until they are read, and with no group. */
export function useExpensePurchases(expenseId: string | null) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<ExpensePurchasesState>({
    expenseId,
    purchases: null,
    isFailed: false,
  });

  useEffect(() => {
    if (!uid || expenseId === null) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startExpensePurchasesListener(
          uid,
          encryption,
          expenseId,
          (purchases) => setState({ expenseId, purchases, isFailed: false }),
          (error) => {
            console.error('The group did not open', error);
            setState({ expenseId, purchases: null, isFailed: true });
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) {
          setState({ expenseId, purchases: null, isFailed: true });
        }
      });
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, expenseId]);

  const isCurrent = state.expenseId === expenseId;
  return {
    purchases:
      isCurrent && state.purchases
        ? [...state.purchases].sort(
            (a, b) => b.date - a.date || b.createdAt - a.createdAt,
          )
        : null,
    isFailed: isCurrent && state.isFailed,
  };
}
