import { useSyncExternalStore } from 'react';

import { useAppSelector } from '@/store';
import {
  selectBillAmountHint,
  selectRecurringHints,
} from '@apps/runway/store/selectors/recurringSelectors';
import {
  getRecurringDismissedVersion,
  subscribeRecurringDismissals,
} from '@apps/runway/utils/recurringDismissed';

const useDismissals = () =>
  useSyncExternalStore(
    subscribeRecurringDismissals,
    getRecurringDismissedVersion,
  );

/** The bank's repeating-charge suggestions, minus the ones dismissed on this device. */
export function useRecurringHints(today: number) {
  const dismissals = useDismissals();
  return useAppSelector((state) =>
    selectRecurringHints(state, today, dismissals),
  );
}

/** One bill's amount suggestion, or null. */
export function useBillAmountHint(billId: string, today: number) {
  const dismissals = useDismissals();
  return useAppSelector((state) =>
    selectBillAmountHint(state, today, billId, dismissals),
  );
}
