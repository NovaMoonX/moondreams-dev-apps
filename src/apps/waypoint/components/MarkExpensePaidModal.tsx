import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';
import {
  getEarlyPayments,
  getPerPersonMultiplier,
  getSplitMemberIds,
} from '@apps/waypoint/utils/splitCalculators';

const PAID_BY_EACH_PERSON = '';

interface MarkExpensePaidFormData {
  payerUid: string;
  paidAmount: string;
}

export interface MarkExpensePaidValues {
  payerUid: string | null;
  paidAmount: number | null;
  knownAmount: number | null;
}

interface MarkExpensePaidModalProps {
  isOpen: boolean;
  trip: TripSpace;
  expense: TripExpense | null;
  isSubmitting?: boolean;
  onSubmit: (values: MarkExpensePaidValues) => Promise<void> | void;
  onClose: () => void;
}

const { input, select } = FormFactories;

function MarkExpensePaidModal({
  isOpen,
  trip,
  expense,
  isSubmitting = false,
  onSubmit,
  onClose,
}: MarkExpensePaidModalProps) {
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const initialData: MarkExpensePaidFormData = {
    payerUid: expense?.payerUid ?? PAID_BY_EACH_PERSON,
    paidAmount: '',
  };
  const isRange = expense?.amount === null;
  const isPerPerson = expense?.isPerPerson ?? false;
  const headcount = expense
    ? getPerPersonMultiplier(expense, getSplitMemberIds(expense, memberIds))
    : 1;
  // A paid expense is usually a known amount by now, so converting the range to one is the
  // default path — "keep the estimate" is the opt-out, not the other way around.
  const [keepAsRange, setKeepAsRange] = useState(false);
  const [formData, setFormData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const memberLabel = (uid: string) => memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;
  const earlyPayers = Object.entries(expense ? getEarlyPayments(expense) : {}).filter(([, payment]) => !payment.isReturned);
  const earlyPaidElsewhere = earlyPayers.filter(([, payment]) => payment.toUid !== (formData.payerUid || null));
  const parsedAmount = Number(formData.paidAmount.trim());
  const isValidAmount =
    formData.paidAmount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount >= 0;
  const isFormComplete = !isRange || keepAsRange || isValidAmount;

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      select({
        name: 'payerUid',
        label: 'Paid by',
        options: [
          { value: PAID_BY_EACH_PERSON, label: 'Paid by each person' },
          ...memberIds.map((uid) => ({
            value: uid,
            label: memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid,
          })),
        ],
      }),
    ];

    if (isRange) {
      nextFields.push(
        input({
          name: 'paidAmount',
          label: isPerPerson ? 'Amount paid per person' : 'Amount paid',
          type: 'number',
          placeholder: keepAsRange ? 'Leave blank to keep the estimated range' : '0.00',
          variant: 'outline',
        }),
      );
    }

    return nextFields;
  }, [isPerPerson, isRange, keepAsRange, memberIds, memberInfo]);

  const handleSubmit = async (data: MarkExpensePaidFormData) => {
    if (!isFormComplete) {
      setError('Enter the amount paid, or choose to keep this as an estimated range.');
      return;
    }

    setError(null);
    await onSubmit({
      payerUid: data.payerUid === PAID_BY_EACH_PERSON ? null : data.payerUid,
      paidAmount: isRange && keepAsRange && isValidAmount ? parsedAmount : null,
      knownAmount: isRange && !keepAsRange && isValidAmount ? parsedAmount : null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Paid'>
      {isRange && (
        <p className='text-muted-foreground mb-4 text-sm'>
          {expense?.title} was estimated as a range.{' '}
          {keepAsRange
            ? 'Enter what was actually paid, or leave it blank to keep the estimate.'
            : "Enter what was actually paid and we'll replace the estimate with it."}
          {isPerPerson &&
            ` We'll multiply it by ${headcount} ${headcount === 1 ? 'person' : 'people'}.`}
        </p>
      )}
      {earlyPayers.length > 0 && (
        <p className='bg-muted/50 mb-4 rounded-lg p-3 text-sm'>
          {earlyPayers.map(([uid, payment]) => `${memberLabel(uid)} already sent ${memberLabel(payment.toUid)} money for this.`).join(' ')}{' '}
          {earlyPaidElsewhere.length === 0
            ? 'It will be counted toward their share.'
            : `If ${memberLabel(earlyPaidElsewhere[0][1].toUid)} isn't who paid, they'll still owe it back.`}
        </p>
      )}
      <Form
        id='waypoint-mark-expense-paid'
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as MarkExpensePaidFormData)}
        onSubmit={(data) => void handleSubmit(data as MarkExpensePaidFormData)}
        submitButton={
          <div className='col-span-full space-y-3'>
            {isRange && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => setKeepAsRange((current) => !current)}
              >
                {keepAsRange ? 'Enter a known amount instead' : 'Keep as an estimated range instead'}
              </Button>
            )}
            {error && <p className='text-destructive text-sm'>{error}</p>}
            <div className='flex justify-end gap-2'>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isFormComplete}>
                {isSubmitting ? 'Marking…' : 'Mark paid'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

export default MarkExpensePaidModal;
