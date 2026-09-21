import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';

import type { TripExpense } from '@apps/waypoint/types';

interface MarkExpensePaidFormData {
  paidAmount: string;
}

interface MarkExpensePaidModalProps {
  isOpen: boolean;
  expense: TripExpense | null;
  isSubmitting?: boolean;
  onSubmit: (paidAmount: number | null) => Promise<void> | void;
  onClose: () => void;
}

const { input } = FormFactories;

function MarkExpensePaidModal({
  isOpen,
  expense,
  isSubmitting = false,
  onSubmit,
  onClose,
}: MarkExpensePaidModalProps) {
  const fields = useMemo(
    () => [
      input({
        name: 'paidAmount',
        label: 'Amount paid',
        type: 'number',
        placeholder: 'Leave blank to keep the estimated range',
        variant: 'outline',
      }),
    ],
    [],
  );

  const handleSubmit = async (data: MarkExpensePaidFormData) => {
    const trimmed = data.paidAmount.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    await onSubmit(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  };

  return (
    <Modal key={expense?.id ?? 'none'} isOpen={isOpen} onClose={onClose} title='Paid amount'>
      <p className='text-muted-foreground mb-4 text-sm'>
        {expense?.title} was estimated as a range. Enter what was actually
        paid, or leave it blank to keep the estimated range.
      </p>
      <Form
        key={isOpen ? 'open' : 'closed'}
        id='waypoint-mark-expense-paid'
        form={fields}
        initialData={{ paidAmount: '' }}
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
