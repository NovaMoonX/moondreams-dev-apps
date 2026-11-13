import { useSyncExternalStore } from 'react';

import { useAppSelector } from '@/store';
import {
  selectChargedToHint,
  selectChargedToHints,
} from '@apps/runway/store/selectors/chargedToSelectors';
import {
  getChargedToDeclinedVersion,
  subscribeChargedToDeclines,
} from '@apps/runway/utils/chargedToDeclined';

const useDeclines = () =>
  useSyncExternalStore(subscribeChargedToDeclines, getChargedToDeclinedVersion);

/** The bills whose charges suggest another card or account, minus the ones declined on this device. */
export function useChargedToHints(today: number) {
  const declines = useDeclines();
  return useAppSelector((state) =>
    selectChargedToHints(state, today, declines),
  );
}

/** One bill's suggestion, or null. */
export function useChargedToHint(billId: string, today: number) {
  const declines = useDeclines();
  return useAppSelector((state) =>
    selectChargedToHint(state, today, billId, declines),
  );
}
