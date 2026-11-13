import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import BankBadge from '@apps/runway/components/BankBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS } from '@apps/runway/constants';
import {
  getCardPendingCents,
  selectPendingByCard,
} from '@apps/runway/store/selectors/cardPendingSelectors';
import type { DateOnly, OpenCard } from '@apps/runway/types';
import {
  describeCardDue,
  getCardDueNow,
  getCardNameWithLastFour,
} from '@apps/runway/utils/cardText';

interface CardRowProps {
  card: OpenCard;
  allCards: readonly OpenCard[];
  reserveCents: number;
  today: DateOnly;
  onOpen: () => void;
}

/** A card as a row: the bank's initial, its name, when it is due (else what it waits for) and what waits to be paid. */
function CardRow({
  card,
  allCards,
  reserveCents,
  today,
  onOpen,
}: CardRowProps) {
  const name = getCardNameWithLastFour(card, allCards);
  const moves = useAppSelector((state) => state.runway.moves);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? 0,
  );
  const due = getCardDueNow(
    card,
    { [card.id]: reserveCents },
    moves,
    today,
    startDate,
  );
  const pendingCents = getCardPendingCents(
    useAppSelector(selectPendingByCard),
    card.id,
    reserveCents,
  );
  const detail =
    describeCardDue(card, today, due) ??
    (reserveCents > 0
      ? CARD_WORDS.waiting
      : reserveCents < 0
        ? CARD_WORDS.paidAhead(formatCents(-reserveCents))
        : CARD_WORDS.nothingToPay);
  return (
    <ItemRow
      name={name}
      leading={<BankBadge name={card.issuer} linkId={card.linkId} />}
      detail={
        pendingCents > 0
          ? `${detail} · ${CARD_WORDS.pendingAmount(formatCents(pendingCents))}`
          : detail
      }
      figure={formatCents(Math.max(0, reserveCents - pendingCents))}
      ariaLabel={`${name}. Open`}
      onOpen={onOpen}
    />
  );
}

export default CardRow;
