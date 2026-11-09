import { useAppSelector } from '@/store';
import { isSelfPaying } from '@apps/runway/engine/autoPay';
import { selectSelfPayingBills } from '@apps/runway/store/selectors/autoPaySelectors';
import type { DateOnly } from '@apps/runway/types';

/** Whether the app pays this bill's payment due on `dueOn` (any payment when it is null). */
export const useIsSelfPaying = (
  billId: string,
  dueOn: DateOnly | null,
  today: DateOnly,
) =>
  useAppSelector((state) => {
    const entry = selectSelfPayingBills(state, today)[billId];
    return (
      entry !== undefined &&
      (dueOn === null || isSelfPaying(entry, dueOn, today))
    );
  });
