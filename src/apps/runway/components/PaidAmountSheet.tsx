import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import {
  CHECKLIST_WORDS,
  MAX_PURCHASE_CENTS,
  PAID_AMOUNT_WORDS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import type { Cents } from '@apps/runway/types';
import { formatRange } from '@apps/runway/utils/rangeText';

interface PaidAmountSheetProps {
  billName: string;
  payment: BillPayment;
  /** Writes the mark with what it came to; resolves true once it is written or there is nothing more to do. */
  onMark: (amountCents: Cents) => Promise<boolean>;
  onClose: () => void;
}

/** Asks what a bill whose amount varies came to before it is marked paid, and says where any difference goes. */
function PaidAmountSheet({
  billName,
  payment,
  onMark,
  onClose,
}: PaidAmountSheetProps) {
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const name = billName === '' ? 'this bill' : billName;
  const cents = parseMoneyToCents(amount);
  const paidCents =
    cents !== null && cents > 0 && cents <= MAX_PURCHASE_CENTS ? cents : null;
  const heldCents = payment.heldNowCents;
  const requestClose = useDiscardGuard({
    isDirty: amount !== '',
    onClose,
    isBusy: isSaving,
  });

  const getNotice = () => {
    if (paidCents === null || paidCents === heldCents) return null;
    if (paidCents > heldCents) {
      return isHidden ? (
        <NeedsALookRow />
      ) : (
        <InlineNotice tone='warning'>
          {PAID_AMOUNT_WORDS.fromFree(formatCents(paidCents - heldCents))}
        </InlineNotice>
      );
    }
    return isHidden ? null : (
      <InlineNotice tone='info'>
        {PAID_AMOUNT_WORDS.stays(formatCents(heldCents - paidCents), name)}
      </InlineNotice>
    );
  };

  const handleMark = async () => {
    if (paidCents === null) return;
    setIsSaving(true);
    const isDone = await onMark(paidCents);
    if (isDone) {
      onClose();
      return;
    }
    setIsSaving(false);
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
                <MaskedText>
                  {PAID_AMOUNT_WORDS.planned(formatRange(payment.ranged.range))}
                </MaskedText>
              )
            }
          />
          {getNotice()}
        </div>
        <ModalFooterActions
          note={paidCents === null ? mask(PAID_AMOUNT_WORDS.needsAmount) : null}
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
              disabled={isSaving || paidCents === null}
              onClick={() => void handleMark()}
            >
              {CHECKLIST_WORDS.markPaid}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default PaidAmountSheet;
