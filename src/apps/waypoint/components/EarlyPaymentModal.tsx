import { useState } from 'react';

import { Button, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup } from '@/components/PillGroup';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getErrorMessage } from '@/utils/errorUtils';
import { toTwoDecimalAmount } from '@/utils/moneyUtils';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import { getEarlyPaymentLimit, getEarlyPayments } from '@apps/waypoint/utils/splitCalculators';

interface EarlyPaymentModalProps {
  isOpen: boolean;
  trip: TripSpace;
  expense: TripExpense | null;
  currentUserId: string;
  formatAmount: (amount: number) => string;
  onSubmit: (values: { toUid: string; amount: number }) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

function EarlyPaymentModal({
  isOpen,
  trip,
  expense,
  currentUserId,
  formatAmount,
  onSubmit,
  onRemove,
  onClose,
}: EarlyPaymentModalProps) {
  const { confirm } = useActionModal();
  const memberIds = Object.keys(trip.members);
  const recipientIds = memberIds.filter((uid) => uid !== currentUserId);
  const memberInfo = useUserInfo(memberIds);
  const memberLabel = (uid: string) => memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;
  const existing = expense ? (getEarlyPayments(expense)[currentUserId] ?? null) : null;
  const limit = expense ? getEarlyPaymentLimit(expense, memberIds, currentUserId) : null;
  const share = limit?.canPayEarly ? limit.share : null;
  const isEstimate = share !== null && share.min !== share.max;
  const [toUid, setToUid] = useState(existing?.toUid ?? (recipientIds.length === 1 ? recipientIds[0] : ''));
  const [amountText, setAmountText] = useState(
    existing ? existing.amount.toFixed(2) : share && share.min > 0 ? share.min.toFixed(2) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!expense) {
    return null;
  }

  const amount = Number(toTwoDecimalAmount(amountText));
  const isAmountValid = amountText.trim() !== '' && Number.isFinite(amount) && amount > 0;
  const getAmountError = () => {
    if (amountText.trim() === '' || !share || !isAmountValid) {
      return undefined;
    }
    return amount > share.max + 0.005
      ? `That's more than your share (${formatAmount(share.max)}). You can only pay ahead for your own part.`
      : undefined;
  };
  const amountError = getAmountError();
  const canSave = limit?.canPayEarly === true && toUid !== '' && isAmountValid && amountError === undefined;

  const run = async (action: () => Promise<void>, fallback: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallback));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove early payment',
      message: `Remove the ${formatAmount(existing?.amount ?? 0)} you sent ${memberLabel(existing?.toUid ?? '')}? It will stop counting in the Dues summary.`,
      destructive: true,
    });
    if (confirmed) {
      await run(onRemove, 'Unable to remove this early payment.');
    }
  };

  const getShareLine = () => {
    if (!share) {
      return null;
    }
    return isEstimate
      ? `${expense.title} is still an estimate, so your share is between ${formatAmount(share.min)} and ${formatAmount(share.max)}.`
      : `Your share of ${expense.title} is ${formatAmount(share.max)}.`;
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title='Paid early'>
      <div className='space-y-5'>
        {limit && !limit.canPayEarly ? (
          <p className='text-muted-foreground text-sm'>{limit.reason}</p>
        ) : (
          <>
            <p className='text-muted-foreground text-sm'>
              {getShareLine()} Already sent your part to someone ahead of time? Record it here. It cancels out when this
              is paid, or shows as owed back to you if plans change.
            </p>
            <div className='space-y-2'>
              <Label>Who did you pay?</Label>
              <PillGroup
                label='Who did you pay'
                options={recipientIds.map((uid) => ({ value: uid, label: memberLabel(uid) }))}
                value={toUid === '' ? null : toUid}
                onChange={setToUid}
              />
            </div>
            <div className='space-y-2'>
              <Label>How much did you send?</Label>
              <MoneyInput
                value={amountText}
                onChange={setAmountText}
                placeholder='0.00'
                ariaLabel='Amount you sent'
                errorMessage={amountError}
              />
              {isEstimate && (
                <p className='text-muted-foreground text-xs'>
                  If your final share comes in lower, the difference stays as money they owe you.
                </p>
              )}
            </div>
          </>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          leftActions={
            existing && <DeleteIconButton label='Remove early payment' disabled={isSaving} onClick={() => void handleRemove()} />
          }
          cancelAction={
            <Button type='button' variant='secondary' onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || !canSave}
              onClick={() => void run(() => onSubmit({ toUid, amount }), 'Unable to save this early payment.')}
            >
              Save
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default EarlyPaymentModal;
