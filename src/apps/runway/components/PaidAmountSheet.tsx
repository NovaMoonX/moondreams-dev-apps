import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CARD_WORDS,
  CHECKLIST_WORDS,
  MAX_PURCHASE_CENTS,
  PAID_AMOUNT_WORDS,
  VARIES_HINT,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { getHeldFor } from '@apps/runway/hooks/useBillPaid';
import type { Cents, MoneyRange } from '@apps/runway/types';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { getBillCardName } from '@apps/runway/utils/cardText';
import { formatRange } from '@apps/runway/utils/rangeText';

interface PaidAmountSheetProps {
  billId: string;
  billName: string;
  payment: BillPayment;
  /** Writes the mark with what it came to; resolves true once it is written or there is nothing more to do. */
  onMark: (amountCents: Cents) => Promise<boolean>;
  onClose: () => void;
}

/** Asks what a bill whose amount varies came to before it is marked paid, and says where any difference goes. */
function PaidAmountSheet({
  billId,
  billName,
  payment,
  onMark,
  onClose,
}: PaidAmountSheetProps) {
  const { isHidden } = useValuesHidden();
  const cardName = useAppSelector((state) =>
    selectLevel(state) === 'track'
      ? getBillCardName(
          state.runway.versions,
          state.runway.cards,
          billId,
          payment.dueOn,
        )
      : null,
  );
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = billName === '' ? 'this bill' : billName;
  const cents = parseMoneyToCents(amount);
  const paidCents =
    cents !== null && cents > 0 && cents <= MAX_PURCHASE_CENTS ? cents : null;
  const heldCents = paidCents === null ? 0 : getHeldFor(payment, paidCents);
  const leftCents = Math.max(0, payment.heldMostCents - heldCents);
  const isPaidElsewhere = payment.paid !== null && !isSaving;
  const requestClose = useDiscardGuard({
    isDirty: amount !== '' && !isPaidElsewhere,
    onClose,
    isBusy: isSaving,
  });

  const getNotice = () => {
    if (paidCents === null || isHidden) return null;
    if (cardName !== null)
      return (
        <InlineNotice tone='info'>
          {CARD_WORDS.chargedTo(cardName)}
        </InlineNotice>
      );
    if (paidCents > heldCents)
      return (
        <InlineNotice tone='info'>
          {heldCents === 0
            ? PAID_AMOUNT_WORDS.allFromFree
            : PAID_AMOUNT_WORDS.fromFree(formatCents(paidCents - heldCents))}
        </InlineNotice>
      );
    return leftCents === 0 ? null : (
      <InlineNotice tone='info'>
        {PAID_AMOUNT_WORDS.stays(formatCents(leftCents), name)}
      </InlineNotice>
    );
  };

  const handleMark = async () => {
    if (paidCents === null) return;
    setError(null);
    setIsSaving(true);
    const isDone = await onMark(paidCents);
    if (isDone) {
      onClose();
      return;
    }
    setIsSaving(false);
    setError(PAID_AMOUNT_WORDS.failed);
  };

  const getRangeHint = (range: MoneyRange) => {
    const usual = formatRange(range);
    if (paidCents !== null && paidCents > range.highCents)
      return PAID_AMOUNT_WORDS.aboveRange(usual);
    if (paidCents !== null && paidCents < range.lowCents)
      return PAID_AMOUNT_WORDS.belowRange(usual);
    return VARIES_HINT(usual);
  };

  const getFooterNote = () => {
    if (isPaidElsewhere) return null;
    if (error) return error;
    return paidCents === null ? PAID_AMOUNT_WORDS.needsAmount : null;
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={PAID_AMOUNT_WORDS.title(name)}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        <div className='space-y-3'>
          <AmountHero
            label={PAID_AMOUNT_WORDS.amount}
            value={amount}
            onChange={setAmount}
            autoFocus
            disabled={isSaving}
            hint={
              payment.ranged && (
                <MaskedText>{getRangeHint(payment.ranged.range)}</MaskedText>
              )
            }
          />
          {isPaidElsewhere ? (
            <InlineNotice tone='info'>
              {PAID_AMOUNT_WORDS.alreadyPaid(name)}
            </InlineNotice>
          ) : (
            getNotice()
          )}
        </div>
        <ModalFooterActions
          note={getFooterNote()}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={requestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || (!isPaidElsewhere && paidCents === null)}
              onClick={() => (isPaidElsewhere ? onClose() : void handleMark())}
            >
              {isPaidElsewhere ? 'Close' : CHECKLIST_WORDS.markPaid}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default PaidAmountSheet;
