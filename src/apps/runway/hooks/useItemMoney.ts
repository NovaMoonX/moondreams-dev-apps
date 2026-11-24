import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import {
  collectItemMoney,
  withHeldAfter,
  type ItemMoneyRow,
} from '@apps/runway/engine/itemMoney';
import {
  selectBalanceInputs,
  selectLedgerOnlyBalances,
} from '@apps/runway/store/selectors/balanceSelectors';
import { selectIsMovesLoaded } from '@apps/runway/store/selectors/runwaySelectors';

const RUNNING_KINDS = new Set(['envelope', 'goal', 'horizon']);

/** What moved one envelope's, goal's or Horizon item's money in the loaded window, newest first, each with what the item held after it; null for any other kind, and `isReady` false until the window is read. */
export function useItemMoney(itemId: string): {
  rows: ItemMoneyRow[];
  isReady: boolean;
} | null {
  const kind = useAppSelector(
    (state) => state.runway.items.find((item) => item.id === itemId)?.kind,
  );
  const isRunning = kind !== undefined && RUNNING_KINDS.has(kind);
  const isReady = useAppSelector(selectIsMovesLoaded);
  const inputs = useAppSelector(selectBalanceInputs);
  const heldNow = useAppSelector(
    (state) => selectLedgerOnlyBalances(state).assignedByItem[itemId] ?? 0,
  );
  const days = useAppSelector((state) => state.runway.days);
  const rows = useMemo(
    () =>
      isRunning
        ? withHeldAfter(
            collectItemMoney(itemId, {
              ...inputs,
              payLineByDay: new Map(days.map((day) => [day.id, day.payLineId])),
            }),
            heldNow,
          )
        : [],
    [isRunning, itemId, inputs, days, heldNow],
  );
  return isRunning ? { rows, isReady } : null;
}
