import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS } from '@apps/runway/constants';
import type { DateOnly, OpenCard } from '@apps/runway/types';
import { describeCardDue, getCardName } from '@apps/runway/utils/cardText';

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
  const name = getCardName(card, allCards);
  return (
    <ItemRow
      name={name}
      leading={<ItemBadge name={card.issuer} emoji={null} />}
      detail={
        describeCardDue(card, reserveCents, today) ??
        (reserveCents > 0
          ? CARD_WORDS.waiting
          : reserveCents < 0
            ? CARD_WORDS.paidAhead(formatCents(-reserveCents))
            : CARD_WORDS.nothingToPay)
      }
      figure={formatCents(Math.max(0, reserveCents))}
      ariaLabel={`${name}. Open`}
      onOpen={onOpen}
    />
  );
}

export default CardRow;
