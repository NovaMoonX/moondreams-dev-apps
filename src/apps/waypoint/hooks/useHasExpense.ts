import { useAppSelector } from '@/store';
import { selectExpenseLinkKeys } from '@apps/waypoint/store/selectors';
import type { ExpenseLinkKind } from '@apps/waypoint/types';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';

export function useHasExpense(kind: ExpenseLinkKind, id: string) {
  return useAppSelector((state) => selectExpenseLinkKeys(state).has(getExpenseLinkKey({ kind, id })));
}
