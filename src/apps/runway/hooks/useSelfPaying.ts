import { useAppSelector } from '@/store';
import { selectSelfPayingBills } from '@apps/runway/store/selectors/autoPaySelectors';
import type { DateOnly } from '@apps/runway/types';

/** Whether the app pays this bill's payment due on `dueOn` (any payment when it is null): it pays itself and the person has not taken a mark of it back. */
export const useIsSelfPaying = (
  billId: string,
  dueOn: DateOnly | null,
  today: DateOnly,
) =>
  useAppSelector((state) => {
    const entry = selectSelfPayingBills(state, today)[billId];
    return (
      entry !== undefined &&
      !(dueOn !== null && entry.undoneDueOn.includes(dueOn))
    );
  });
