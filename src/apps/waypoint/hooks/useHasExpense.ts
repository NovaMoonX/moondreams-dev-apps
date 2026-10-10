import { useAppSelector } from '@/store';
import { selectExpenseLinkKeys, selectNoExpenseKeys } from '@apps/waypoint/store/selectors';
import type { ExpenseLinkKind } from '@apps/waypoint/types';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';

export function useHasExpense(kind: ExpenseLinkKind, id: string) {
  return useAppSelector((state) => selectExpenseLinkKeys(state).has(getExpenseLinkKey({ kind, id })));
}

/** True once someone marked the plan as needing no expense. */
export function useIsNoExpense(kind: ExpenseLinkKind, id: string) {
  return useAppSelector((state) => selectNoExpenseKeys(state).has(getExpenseLinkKey({ kind, id })));
}
