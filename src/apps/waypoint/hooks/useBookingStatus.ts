import { useAppSelector } from '@/store';
import { selectBookingStatusByKey, selectNoBookingKeys } from '@apps/waypoint/store/selectors';
import type { ExpenseLinkKind } from '@apps/waypoint/types';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';

/** How many to-dos are linked to a plan, how many are still open, and whether it was marked "nothing to book". */
export function useBookingStatus(kind: ExpenseLinkKind, id: string) {
  const key = getExpenseLinkKey({ kind, id });
  const total = useAppSelector((state) => selectBookingStatusByKey(state).get(key)?.total ?? 0);
  const open = useAppSelector((state) => selectBookingStatusByKey(state).get(key)?.open ?? 0);
  const isNoBooking = useAppSelector((state) => selectNoBookingKeys(state).has(key));
  return { total, open, isNoBooking };
}
