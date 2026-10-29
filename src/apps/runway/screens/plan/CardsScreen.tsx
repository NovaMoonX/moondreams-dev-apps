import { useState } from 'react';
import { CreditCard } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import CardSheet from '@apps/runway/components/CardSheet';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS } from '@apps/runway/constants';
import CardForm from '@apps/runway/forms/CardForm';
import PayCardSheet from '@apps/runway/forms/PayCardSheet';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectAllCards,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardName } from '@apps/runway/utils/cardText';

type Open = { cardId: string; view: 'menu' | 'pay' | 'change' };

function CardsScreen() {
  const allCards = useAppSelector(selectAllCards);
  const balances = useAppSelector(selectBalances);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [formKey, setFormKey] = useState<number | null>(null);
  const [open, setOpen] = useState<Open | null>(null);

  // An archived card that still waits to be paid stays listed, so it can be paid off.
  const cards = allCards.filter(
    (card) =>
      card.archivedAt === null || (balances.reserveByCard[card.id] ?? 0) > 0,
  );
  const opened = cards.find((card) => card.id === open?.cardId) ?? null;

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
          {cards.map((card) => {
            const reserveCents = balances.reserveByCard[card.id] ?? 0;
            const name = getCardName(card, allCards);
            return (
              <ItemRow
                key={card.id}
                name={name}
                leading={
                  <ItemBadge name={card.name ?? card.issuer} emoji={null} />
                }
                detail={
                  reserveCents > 0
                    ? CARD_WORDS.waiting
                    : reserveCents < 0
                      ? CARD_WORDS.paidAhead(formatCents(-reserveCents))
                      : CARD_WORDS.nothingToPay
                }
                figure={formatCents(Math.max(0, reserveCents))}
                ariaLabel={`${name}. Open`}
                onOpen={() => setOpen({ cardId: card.id, view: 'menu' })}
              />
            );
          })}
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
      {opened && open?.view === 'menu' && (
        <CardSheet
          card={opened}
          onClose={() => setOpen(null)}
          onPay={() => setOpen({ cardId: opened.id, view: 'pay' })}
          onChange={() => setOpen({ cardId: opened.id, view: 'change' })}
        />
      )}
      {opened && open?.view === 'pay' && (
        <PayCardSheet
          card={opened}
          onClose={() => setOpen(null)}
          onCancel={() => setOpen({ cardId: opened.id, view: 'menu' })}
        />
      )}
      {opened && open?.view === 'change' && (
        <CardForm
          isOpen
          editing={opened}
          onClose={() => setOpen(null)}
          onCancel={() => setOpen({ cardId: opened.id, view: 'menu' })}
        />
      )}
    </div>
  );
}

export default CardsScreen;
