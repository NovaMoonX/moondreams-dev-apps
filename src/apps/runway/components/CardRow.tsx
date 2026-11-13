import { useAppSelector } from '@/store';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import BankBadge from '@apps/runway/components/BankBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS } from '@apps/runway/constants';
import {
  getCardPendingCents,
  selectPendingByCard,
} from '@apps/runway/store/selectors/cardPendingSelectors';
import {
  getLinkedStatement,
  selectCardsWithBankDue,
} from '@apps/runway/store/selectors/cardStatementSelectors';
import { getMinimumDue } from '@apps/runway/engine/cards';
import type { DateOnly, OpenCard } from '@apps/runway/types';
import {
  dayOf,
  describeCardDue,
  describeMinimumShort,
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
  card: typedCard,
  allCards,
  reserveCents,
  today,
  onOpen,
}: CardRowProps) {
  const card =
    useAppSelector(selectCardsWithBankDue).find(
      (entry) => entry.id === typedCard.id,
    ) ?? typedCard;
  const name = getCardNameWithLastFour(card, allCards);
  const minimumCents = getMinimumDue(
    useAppSelector((state) =>
      getLinkedStatement(state.runway.cardStatements, card),
    ),
  );
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
  const isMinimumShown = reserveCents > 0 && minimumCents !== null;
  // Beside a minimum a "not paid by" tail would run the line to three rows at 320px, so only the date stays.
  const dueText =
    isMinimumShown && due?.rolledFrom
      ? CARD_WORDS.dueOn(dayOf(due.dueOn))
      : describeCardDue(card, today, due);
  const detail =
    dueText ??
    (reserveCents > 0
      ? CARD_WORDS.waiting
      : reserveCents < 0
        ? CARD_WORDS.paidAhead(formatCents(-reserveCents))
        : CARD_WORDS.nothingToPay);
  const parts = [
    detail,
    isMinimumShown ? describeMinimumShort(minimumCents) : null,
    pendingCents > 0
      ? CARD_WORDS.pendingAmount(formatCentsShort(pendingCents))
      : null,
  ].filter((part) => part !== null);
  return (
    <ItemRow
      name={name}
      leading={<BankBadge name={card.issuer} linkId={card.linkId} />}
      detail={parts.join(' · ')}
      figure={formatCents(Math.max(0, reserveCents - pendingCents))}
      ariaLabel={`${name}. Open`}
      onOpen={onOpen}
    />
  );
}

export default CardRow;
