import { useAppSelector } from '@/store';
import type { CostPayment } from '@apps/runway/engine/horizon';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import {
  selectCostPayments,
  selectHorizonItems,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonCost } from '@apps/runway/types';

export interface DueCostEntry {
  entry: Lookahead['dueCosts'][number];
  cost: HorizonCost;
  payment: CostPayment;
  emoji: string | null;
}

/** The unpaid costs due today or past due that the card draws, each with the item's cost and payment it stands for; Home and Bills ask the same rows whether anything is due. */
export function useDueCostRows(
  lookahead: Lookahead | null,
  today: number,
): DueCostEntry[] {
  const costPayments = useAppSelector((state) =>
    selectCostPayments(state, today),
  );
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  return (lookahead?.dueCosts ?? []).flatMap((entry) => {
    const horizon = horizons.find(({ item }) => item.id === entry.itemId);
    const cost = horizon?.version.payload.costs.find(
      ({ id }) => id === entry.costId,
    );
    const payment = (costPayments[entry.itemId] ?? []).find(
      ({ costId, dueOn }) => costId === entry.costId && dueOn === entry.dueOn,
    );
    return horizon && cost && payment && payment.paid === null
      ? [{ entry, cost, payment, emoji: horizon.version.payload.emoji }]
      : [];
  });
}
