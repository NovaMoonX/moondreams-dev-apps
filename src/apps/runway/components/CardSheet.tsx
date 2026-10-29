import { useState } from 'react';
import { Archive, Pencil } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import SheetHead from '@apps/runway/components/SheetHead';
import { CARD_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { archiveCard } from '@apps/runway/store/actions/cardActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

interface CardSheetProps {
  card: OpenCard;
  onClose: () => void;
  onPay: () => void;
  onChange: () => void;
}

/** What a card row opens: what it waits for as the figure, then paying it off, changing it and archiving it. */
function CardSheet({ card, onClose, onPay, onChange }: CardSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const cards = useAppSelector(selectAllCards);
  const balances = useAppSelector(selectBalances);
  const [isArchiving, setIsArchiving] = useState(false);
  const reserveCents = balances.reserveByCard[card.id] ?? 0;
  const name = getCardName(card, cards);

  const handleArchive = async () => {
    if (!user || isArchiving) return;
    const isConfirmed = await confirm({
      title: CARD_WORDS.archiveConfirmTitle(name),
      message:
        reserveCents > 0
          ? mask(CARD_WORDS.archiveWaitingText(formatCents(reserveCents)))
          : CARD_WORDS.archiveSub,
      confirmText: CARD_WORDS.archiveConfirmText,
    });
    if (!isConfirmed) return;
    setIsArchiving(true);
    try {
      await archiveCard(user.uid, card.id);
      addToast({ title: CARD_WORDS.archived(name), type: 'success' });
      onClose();
    } catch (error) {
      addToast({
        title: CARD_WORDS.archiveFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
      setIsArchiving(false);
    }
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={name}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
        <SheetHead
          label={CARD_WORDS.reserveLabel}
          figure={formatCents(reserveCents)}
        />
        <Button type='button' className='w-full' onClick={onPay}>
          {CARD_WORDS.payOff(name)}
        </Button>
        <ActionGroup>
          <ActionRow
            isGrouped
            hasChevron
            icon={<Pencil />}
            label={CARD_WORDS.change}
            onClick={onChange}
          />
          {card.archivedAt === null && (
            <ActionRow
              isGrouped
              icon={<Archive />}
              label={CARD_WORDS.archive}
              isDisabled={isArchiving}
              onClick={() => void handleArchive()}
            />
          )}
        </ActionGroup>
      </div>
    </FormSheet>
  );
}

export default CardSheet;
