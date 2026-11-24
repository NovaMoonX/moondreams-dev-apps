import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  DEFAULT_SPEND_PERIOD,
  ITEM_VIEW_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useItemMoney } from '@apps/runway/hooks/useItemMoney';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { describeHeldAfter } from '@apps/runway/utils/purchaseText';
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
  const level = useAppSelector(selectLevel);
  const money = useItemMoney(envelopeId);
  const moneyRows = money?.isReady ? money.rows : [];
  const heldAfter = new Map(moneyRows.map((row) => [row.id, row]));
  const order = new Map(moneyRows.map((row, index) => [row.id, index]));
  const range = getSpendRange(DEFAULT_SPEND_PERIOD, today);
  const isReady =
    isLoaded &&
    (periodFor === range.key ||
      (recentFrom !== null && range.from >= recentFrom));
  const rows = all
    .filter(
      (purchase) =>
        purchase.date >= range.from &&
        purchase.date < range.to &&
        purchase.lines.some((line) => line.envelopeId === envelopeId),
    )
    .sort(
      (a, b) =>
        b.date - a.date || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
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
  const isOthersInRange = moneyRows.some(
    (row) =>
      row.kind !== 'purchase' && row.on >= range.from && row.on < range.to,
  );
  return (
    <div className='space-y-2'>
      {isOthersInRange && (
        <p className='text-muted-foreground text-xs'>
          {ITEM_VIEW_WORDS.purchasesTotalsNote}
        </p>
      )}
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {rows.map((purchase) => {
          const row = heldAfter.get(purchase.id);
          const held =
            row === undefined
              ? null
              : describeHeldAfter('envelope', level, row.heldAfterCents);
          return (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              looks={looks}
              shareCents={row?.cents ?? null}
              figureWord={held?.text ?? null}
              isFigureWordOver={held?.isOver ?? false}
              subjectId={envelopeId}
              onOpen={() => onOpen(purchase.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}

export default ItemPurchasesView;
