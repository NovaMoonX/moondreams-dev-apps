import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  DEFAULT_SPEND_PERIOD,
  ITEM_VIEW_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  selectIsMovesLoaded,
  selectItemLooks,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpendRange } from '@apps/runway/utils/spendPeriod';

interface ItemPurchasesViewProps {
  envelopeId: string;
  onOpen: (purchaseId: string) => void;
}

/** What came out of one envelope this month; each row opens the purchase and comes back here. */
function ItemPurchasesView({ envelopeId, onOpen }: ItemPurchasesViewProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const recentFrom = useAppSelector(selectRecentFrom);
  const all = useAppSelector(selectSpendPurchases);
  const periodFor = useAppSelector((state) => state.runway.periodFor);
  const looks = useAppSelector(selectItemLooks);
  const range = getSpendRange(DEFAULT_SPEND_PERIOD, today);
  const isReady =
    isLoaded &&
    (periodFor === range.key ||
      (recentFrom !== null && range.from >= recentFrom));
  const rows = all.filter(
    (purchase) =>
      purchase.date >= range.from &&
      purchase.date < range.to &&
      purchase.lines.some((line) => line.envelopeId === envelopeId),
  );

  if (!isReady) {
    return (
      <p className='text-muted-foreground text-sm'>{SPEND_WORDS.loading}</p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.purchasesEmpty}
      </p>
    );
  }
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map((purchase) => (
        <PurchaseRow
          key={purchase.id}
          purchase={purchase}
          isPrivate={false}
          looks={looks}
          onOpen={() => onOpen(purchase.id)}
        />
      ))}
    </ul>
  );
}

export default ItemPurchasesView;
