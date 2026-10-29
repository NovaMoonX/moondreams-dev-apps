import { useState } from 'react';
import { CreditCard } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import CardRow from '@apps/runway/components/CardRow';
import CardSheets, {
  type OpenedCard,
} from '@apps/runway/components/CardSheets';
import { CARD_WORDS } from '@apps/runway/constants';
import CardForm from '@apps/runway/forms/CardForm';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllCards,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useNow } from '@/hooks/useNow';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getListedCards } from '@apps/runway/utils/cardText';

function CardsScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const allCards = useAppSelector(selectAllCards);
  const balances = useAppSelector(selectBalances);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [formKey, setFormKey] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenedCard | null>(null);

  // An archived card that still waits to be paid stays listed, so it can be paid off.
  const cards = getListedCards(allCards, balances.reserveByCard);

  return (
    <div className='space-y-4'>
      <SectionHeader title={CARD_WORDS.sectionTitle} />
      {!isLedgerReady ? (
        <p className='text-muted-foreground text-sm' role='status'>
          {CARD_WORDS.loading}
        </p>
      ) : cards.length === 0 ? (
        <EmptyCard icon={<CreditCard className='h-5 w-5' />}>
          {CARD_WORDS.emptyTitle}
        </EmptyCard>
      ) : (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              allCards={allCards}
              reserveCents={balances.reserveByCard[card.id] ?? 0}
              today={today}
              onOpen={() => setOpen({ cardId: card.id, view: 'menu' })}
            />
          ))}
        </ul>
      )}
      <FloatingAction
        label={CARD_WORDS.add}
        icon={<CreditCard className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {formKey !== null && (
        <CardForm key={formKey} isOpen onClose={() => setFormKey(null)} />
      )}
      <CardSheets cards={cards} open={open} onChange={setOpen} />
    </div>
  );
}

export default CardsScreen;
