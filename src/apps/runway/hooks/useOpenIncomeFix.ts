import { useNow } from '@/hooks/useNow';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectResolvedPlan } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

/** The door for "no income before it": the repeating pay whose end stops the income, opened on when it ends, or a new pay when none ends. */
export function useOpenIncomeFix() {
  const { showOnPlan, showAddOnTab } = useRunwayUrlState();
  const today = todayAsUtcDate(useNow(60_000));
  const sources = useAppSelector((state) => selectResolvedPlan(state, today));
  const endingPay = sources
    .flatMap(({ payLines }) => payLines)
    .find(
      ({ version }) =>
        version.payload.schedule.kind !== 'once' &&
        (version.payload.ending.afterCount !== null ||
          version.payload.ending.onDate !== null),
    );
  const open = () =>
    afterBackLayersClose(() => {
      if (endingPay) {
        void showOnPlan('income', { itemId: endingPay.item.id, step: 'ends' });
        return;
      }
      void showAddOnTab('income', 'plan', 'income');
    });
  return { open, hasEndingPay: endingPay !== undefined };
}
