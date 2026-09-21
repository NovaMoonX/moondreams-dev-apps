import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
  Tabs,
} from '@moondreamsdev/dreamer-ui/components';

import { getErrorMessage } from '@/utils/errorUtils';
import { useUserInfo } from '@/hooks/useUserInfo';
import type { ExpenseStatus, TripSpace } from '@apps/waypoint/types';

interface ExpenseFormData {
  title: string;
  amountMode: 'amount' | 'range';
  amount: string;
  amountMin: string;
  amountMax: string;
  currency: string;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: string;
}

export interface ExpenseSubmitValues {
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: number | null;
  currency: string;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  defaultPayerUid: string;
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select } = FormFactories;

function getDayCount(trip: TripSpace) {
  return Math.floor((trip.endDate - trip.startDate) / 86_400_000) + 1;
}

function ExpenseFormModal({
  isOpen,
  trip,
  defaultPayerUid,
  isSubmitting = false,
  onSubmit,
  onClose,
}: ExpenseFormModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExpenseFormData['amountMode']>('amount');
  const [formData, setFormData] = useState<ExpenseFormData>({
    title: '',
    amountMode: 'amount',
    amount: '',
    amountMin: '',
    amountMax: '',
    currency: trip.defaultCurrency ?? 'USD',
    payerUid: defaultPayerUid,
    status: 'EXPECTED',
    dayIndex: '',
  });
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const parsedAmount = Number(formData.amount);
  const parsedAmountMin = Number(formData.amountMin);
  const parsedAmountMax = Number(formData.amountMax);
  const isFormComplete =
    formData.title.trim() !== '' &&
    (mode === 'amount'
      ? formData.amount.trim() !== '' && Number.isFinite(parsedAmount)
      : formData.amountMin.trim() !== '' &&
        formData.amountMax.trim() !== '' &&
        Number.isFinite(parsedAmountMin) &&
        Number.isFinite(parsedAmountMax) &&
        parsedAmountMax >= parsedAmountMin) &&
    formData.currency.trim() !== '' &&
    formData.payerUid !== '';
  const dayOptions = useMemo(
    () => [
      { value: '', label: 'Other' },
      ...Array.from({ length: getDayCount(trip) }, (_, index) => ({
        value: String(index),
        label: `Day ${index + 1}`,
      })),
    ],
    [trip],
  );
  const memberOptions = useMemo(
    () =>
      memberIds.map((uid) => ({
        value: uid,
        label:
          memberInfo?.map[uid]?.displayName ||
          memberInfo?.map[uid]?.email ||
          (uid === trip.createdBy ? `${uid} (trip creator)` : uid),
      })),
    [memberIds, memberInfo, trip],
  );

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Expense title',
        placeholder: 'Dinner reservation',
        variant: 'outline',
      }),
      custom({
        name: 'amountMode',
        label: 'Amount type',
        renderComponent: (props) => (
          <Tabs
            value={props.value as ExpenseFormData['amountMode']}
            onValueChange={(value) => {
              setMode(value as ExpenseFormData['amountMode']);
              props.onValueChange(value);
            }}
            tabsList={[
              { value: 'amount', label: 'Known amount' },
              { value: 'range', label: 'Estimated range' },
            ]}
            tabsWidth='full'
            variant='pills'
          />
        ),
      }),
      ...(mode === 'amount'
        ? [
            input({
              name: 'amount',
              label: 'Amount',
              type: 'number',
              placeholder: '0.00',
              variant: 'outline',
            }),
          ]
        : [
            input({
              name: 'amountMin',
              label: 'Minimum amount',
              type: 'number',
              placeholder: '0.00',
              variant: 'outline',
            }),
            input({
              name: 'amountMax',
              label: 'Maximum amount',
              type: 'number',
              placeholder: '0.00',
              variant: 'outline',
            }),
          ]),
      input({
        name: 'currency',
        label: 'Currency',
        placeholder: 'USD',
        variant: 'outline',
      }),
      select({
        name: 'payerUid',
        label: 'Paid by',
        options: memberOptions,
      }),
      select({
        name: 'status',
        label: 'Status',
        options: [
          { value: 'EXPECTED', label: 'Expected' },
          { value: 'PAID', label: 'Paid' },
        ],
      }),
      select({
        name: 'dayIndex',
        label: 'Trip day',
        options: dayOptions,
      }),
    ],
    [dayOptions, memberOptions, mode],
  );

  const handleSubmit = async (data: ExpenseFormData) => {
    const parseAmount = (value: string) => {
      const parsed = Number(value);
      return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
    };
    const amount = mode === 'amount' ? parseAmount(data.amount) : null;
    const amountMin = mode === 'range' ? parseAmount(data.amountMin) : null;
    const amountMax = mode === 'range' ? parseAmount(data.amountMax) : null;

    if (
      !data.title.trim() ||
      (mode === 'amount' && amount === null) ||
      (mode === 'range' && (amountMin === null || amountMax === null))
    ) {
      setError('Enter a title and a valid amount.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title: data.title,
        amount,
        amountMin,
        amountMax,
        payerUid: data.payerUid,
        status: data.status,
        dayIndex: data.dayIndex === '' ? null : Number(data.dayIndex),
        currency: data.currency,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this expense.'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Add expense'>
      <Form
        key={isOpen ? 'open' : 'closed'}
        id='waypoint-add-expense'
        form={fields}
        initialData={formData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => setFormData(data as ExpenseFormData)}
        onSubmit={(data) => void handleSubmit(data as ExpenseFormData)}
        submitButton={
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button
              type='submit'
              loading={isSubmitting}
              disabled={isSubmitting || !isFormComplete}
            >
              {isSubmitting ? 'Adding…' : 'Add expense'}
            </Button>
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default ExpenseFormModal;
