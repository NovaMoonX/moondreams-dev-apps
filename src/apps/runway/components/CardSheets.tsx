import CardSheet from '@apps/runway/components/CardSheet';
import CardForm from '@apps/runway/forms/CardForm';
import PayCardSheet from '@apps/runway/forms/PayCardSheet';
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

/** The sheet a card opens and the screens it leads to (Pay off, Change), swapped in place; Cancel returns to the sheet. */
function CardSheets({ cards, open, onChange }: CardSheetsProps) {
  const opened = cards.find((card) => card.id === open?.cardId) ?? null;
  if (!opened || !open) return null;
  const goTo = (view: OpenedCard['view']) =>
    onChange({ cardId: opened.id, view });

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
