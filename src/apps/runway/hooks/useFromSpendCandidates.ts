import { useAppSelector } from '@/store';
import { DAY_MS } from '@apps/runway/engine/dates';
import { isOpenToPlace } from '@apps/runway/engine/purchases';
import { selectTwinHeldIds } from '@apps/runway/store/selectors/emailSelectors';
import {
  selectNeedsHomeSections,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';

const RECENT_DAYS = 60;

/** The charges no envelope has yet: those waiting in Needs a home, then bank or email ones left in Free to Spend in the last 60 days, newest first. */
export function useFromSpendCandidates(today: number): OpenPurchase[] {
  const { charges } = useAppSelector((state) =>
    selectNeedsHomeSections(state, today),
  );
  const all = useAppSelector(selectSpendPurchases);
  const twinHeld = useAppSelector(selectTwinHeldIds);
  const from = today - RECENT_DAYS * DAY_MS;
  const open = all.filter(
    (purchase) =>
      purchase.date >= from &&
      isOpenToPlace(purchase) &&
      !twinHeld.has(purchase.id),
  );
  return [
    ...charges.filter((purchase) => !twinHeld.has(purchase.id)),
    ...open.filter((purchase) => !charges.some((c) => c.id === purchase.id)),
  ].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}
