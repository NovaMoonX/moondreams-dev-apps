import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';

const PAID_BY_EACH_PERSON = '';

interface MarkExpensePaidFormData {
  payerUid: string;
  paidAmount: string;
}

export interface MarkExpensePaidValues {
  payerUid: string | null;
  paidAmount: number | null;
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
          label: 'Amount paid',
          type: 'number',
          placeholder: 'Leave blank to keep the estimated range',
          variant: 'outline',
        }),
      );
    }

    return nextFields;
  }, [isRange, memberIds, memberInfo]);

  const handleSubmit = async (data: MarkExpensePaidFormData) => {
    const trimmed = data.paidAmount.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    await onSubmit({
      payerUid: data.payerUid === PAID_BY_EACH_PERSON ? null : data.payerUid,
      paidAmount: isRange && parsed !== null && Number.isFinite(parsed) ? parsed : null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Paid'>
      {isRange && (
        <p className='text-muted-foreground mb-4 text-sm'>
          {expense?.title} was estimated as a range. Enter what was actually paid, or
          leave it blank to keep the estimate.
        </p>
      )}
      <Form
        id='waypoint-mark-expense-paid'
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onSubmit={(data) => void handleSubmit(data as MarkExpensePaidFormData)}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button type='submit' loading={isSubmitting} disabled={isSubmitting}>
              {isSubmitting ? 'Marking…' : 'Mark paid'}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

export default MarkExpensePaidModal;
