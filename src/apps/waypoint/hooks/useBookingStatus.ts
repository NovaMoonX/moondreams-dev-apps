import { useAppSelector } from '@/store';
import { selectBookingStatusByKey, selectNoBookingKeys } from '@apps/waypoint/store/selectors';
import type { ExpenseLinkKind } from '@apps/waypoint/types';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';

/** How many to-dos are linked to a plan and how many are still open, and whether it was marked "nothing to book". */
export function useBookingStatus(kind: ExpenseLinkKind, id: string) {
  const key = getExpenseLinkKey({ kind, id });
  const status = useAppSelector((state) => selectBookingStatusByKey(state).get(key));
  const isNoBooking = useAppSelector((state) => selectNoBookingKeys(state).has(key));
  return { total: status?.total ?? 0, open: status?.open ?? 0, isNoBooking };
}
