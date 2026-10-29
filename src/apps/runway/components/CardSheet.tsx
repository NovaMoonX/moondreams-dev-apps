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
import {
  archiveCard,
  undoCardPayment,
} from '@apps/runway/store/actions/cardActions';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { collectCardPaid, type CardPaid } from '@apps/runway/engine/progress';
import SensitiveValue from '@/components/SensitiveValue';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

/** Payments the sheet lists; older ones stay in the ledger and the figures. */
const RECENT_PAYMENTS = 5;

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
  const moves = useAppSelector((state) => state.runway.moves);
  const [takingBack, setTakingBack] = useState<string | null>(null);
  const payments = [...(collectCardPaid(moves)[card.id] ?? [])]
    .sort((a, b) => b.on - a.on || (a.moveId < b.moveId ? 1 : -1))
    .slice(0, RECENT_PAYMENTS);
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

  const takeBack = async (payment: CardPaid) => {
    if (!user || takingBack !== null) return;
    const amount = formatCents(payment.cents);
    const day = formatDateShortUTC(payment.on);
    const isConfirmed = await confirm({
      title: CARD_WORDS.takeBackTitle,
      message: mask(CARD_WORDS.takeBackText(amount, day)),
      confirmText: CARD_WORDS.takeBackConfirm,
    });
    if (!isConfirmed) return;
    setTakingBack(payment.moveId);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoCardPayment(user.uid, encryption, {
        moveId: payment.moveId,
        cardId: card.id,
        date: payment.on,
        amountCents: payment.cents,
      });
      addToast({ title: CARD_WORDS.undone(name), type: 'success' });
    } catch (error) {
      addToast({
        title: CARD_WORDS.undoFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
    }
    setTakingBack(null);
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
          figure={formatCents(Math.max(0, reserveCents))}
          fact={
            reserveCents < 0
              ? mask(CARD_WORDS.paidAhead(formatCents(-reserveCents)))
              : undefined
          }
        />
        <Button
          type='button'
          variant={reserveCents > 0 ? 'primary' : 'secondary'}
          className='w-full'
          onClick={onPay}
        >
          {CARD_WORDS.payOffShort}
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
        {payments.length > 0 && (
          <section className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {CARD_WORDS.paymentsTitle}
            </p>
            <ul className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
              {payments.map((payment) => (
                <li
                  key={payment.moveId}
                  className='flex items-center justify-between gap-3 py-1.5 pr-1.5 pl-3'
                >
                  <span className='min-w-0'>
                    {formatDateShortUTC(payment.on)}
                    {' · '}
                    <SensitiveValue className='tabular-nums'>
                      {formatCents(payment.cents)}
                    </SensitiveValue>
                  </span>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    aria-label={mask(
                      CARD_WORDS.takeBackLabel(
                        formatCents(payment.cents),
                        formatDateShortUTC(payment.on),
                      ),
                    )}
                    disabled={takingBack !== null}
                    onClick={() => void takeBack(payment)}
                  >
                    {CARD_WORDS.takeBack}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </FormSheet>
  );
}

export default CardSheet;
