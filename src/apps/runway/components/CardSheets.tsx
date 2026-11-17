import CardSheet from '@apps/runway/components/CardSheet';
import CardForm from '@apps/runway/forms/CardForm';
import PayCardSheet from '@apps/runway/forms/PayCardSheet';
import StartPaymentSheet from '@apps/runway/forms/StartPaymentSheet';
import { useAppSelector } from '@/store';
import { selectBankOwedByCard } from '@apps/runway/store/selectors/cardBankSelectors';
import type { OpenCard } from '@apps/runway/types';

export type OpenedCard = {
  cardId: string;
  view: 'menu' | 'pay' | 'change';
};

interface CardSheetsProps {
  cards: readonly OpenCard[];
  open: OpenedCard | null;
  onChange: (open: OpenedCard | null) => void;
}

/** The sheet a card opens and the screens it leads to (Pay off, or I started a payment for a card read from its bank, and Change), swapped in place; Cancel returns to the sheet. */
function CardSheets({ cards, open, onChange }: CardSheetsProps) {
  const opened = cards.find((card) => card.id === open?.cardId) ?? null;
  const bankOwed = useAppSelector(selectBankOwedByCard);
  if (!opened || !open) return null;
  const goTo = (view: OpenedCard['view']) =>
    onChange({ cardId: opened.id, view });

  if (open.view === 'pay' && bankOwed[opened.id] !== undefined) {
    return (
      <StartPaymentSheet
        card={opened}
        onClose={() => onChange(null)}
        onCancel={() => goTo('menu')}
      />
    );
  }
  if (open.view === 'pay') {
    return (
      <PayCardSheet
        card={opened}
        onClose={() => onChange(null)}
        onCancel={() => goTo('menu')}
      />
    );
  }
  if (open.view === 'change') {
    return (
      <CardForm
        isOpen
        editing={opened}
        onClose={() => onChange(null)}
        onCancel={() => goTo('menu')}
      />
    );
  }
  return (
    <CardSheet
      card={opened}
      onClose={() => onChange(null)}
      onPay={() => goTo('pay')}
      onChange={() => goTo('change')}
    />
  );
}

export default CardSheets;
