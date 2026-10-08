import { useAppSelector } from '@/store';
import { selectExpenseLinkKeys, selectNoExpenseKeys } from '@apps/waypoint/store/selectors';
import type { ExpenseLinkKind } from '@apps/waypoint/types';
import { getExpenseLinkKey } from '@apps/waypoint/utils/relatedSubjects';

/** True once a plan has an expense attached or someone said it needs none. */
export function useHasExpense(kind: ExpenseLinkKind, id: string) {
  return useAppSelector((state) => {
    const key = getExpenseLinkKey({ kind, id });
    return selectExpenseLinkKeys(state).has(key) || selectNoExpenseKeys(state).has(key);
  });
}
