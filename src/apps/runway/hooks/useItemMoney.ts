import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import {
  collectItemMoney,
  withBroughtForward,
  withHeldAfter,
  type ItemMoneyRow,
} from '@apps/runway/engine/itemMoney';
import {
  selectBalanceInputs,
  selectLedgerOnlyBalances,
} from '@apps/runway/store/selectors/balanceSelectors';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
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
  const recentFrom = useAppSelector(selectRecentFrom);
  const rows = useMemo(() => {
    if (!isRunning) return [];
    const held = withHeldAfter(
      collectItemMoney(itemId, {
        ...inputs,
        payLineByDay: new Map(days.map((day) => [day.id, day.payLineId])),
      }),
      heldNow,
    );
    const isCut =
      recentFrom !== null &&
      inputs.startDate !== null &&
      recentFrom > inputs.startDate;
    return withBroughtForward(held, heldNow, itemId, isCut ? recentFrom : null);
  }, [isRunning, itemId, inputs, days, heldNow, recentFrom]);
  return isRunning ? { rows, isReady } : null;
}
