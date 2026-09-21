import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
  Tabs,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { getErrorMessage } from '@/utils/errorUtils';
import { useUserInfo } from '@/hooks/useUserInfo';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import type { ExpenseStatus, TripExpense, TripSpace } from '@apps/waypoint/types';

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
  paidAmount: string;
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
  paidAmount: number | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  defaultPayerUid: string;
  initialExpense?: TripExpense;
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
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
  initialExpense,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExpenseFormData['amountMode']>(
    initialExpense?.amount === null ? 'range' : 'amount',
  );
  const [formData, setFormData] = useState<ExpenseFormData>({
    title: initialExpense?.title ?? '',
    amountMode: initialExpense?.amount === null ? 'range' : 'amount',
    amount: initialExpense?.amount === null ? '' : String(initialExpense?.amount ?? ''),
    amountMin: String(initialExpense?.amountMin ?? ''),
    amountMax: String(initialExpense?.amountMax ?? ''),
    currency: initialExpense?.currency ?? trip.defaultCurrency ?? 'USD',
    payerUid: initialExpense?.payerUid ?? defaultPayerUid,
    status: initialExpense?.status ?? 'EXPECTED',
    dayIndex:
      initialExpense?.dayIndex === null || initialExpense?.dayIndex === undefined
        ? ''
        : String(initialExpense.dayIndex),
    paidAmount: String(initialExpense?.paidAmount ?? ''),
  });
  const isEditing = Boolean(initialExpense);
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
      { value: '', label: 'No specific day' },
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
      ...(isEditing && mode === 'range' && initialExpense?.status === 'PAID'
        ? [
            input({
              name: 'paidAmount',
              label: 'Paid amount',
              type: 'number',
              placeholder: '0.00',
              variant: 'outline',
            }),
          ]
        : []),
      ...(!isEditing
        ? [
            input({
              name: 'currency',
              label: 'Currency',
              placeholder: 'USD',
              variant: 'outline',
            }),
          ]
        : []),
      select({
        name: 'payerUid',
        label: 'Paid by',
        options: memberOptions,
      }),
      ...(!isEditing
        ? [
            select({
              name: 'status',
              label: 'Status',
              options: [
                { value: 'EXPECTED', label: 'Expected' },
                { value: 'PAID', label: 'Paid' },
              ],
            }),
          ]
        : []),
      select({
        name: 'dayIndex',
        label: 'Trip day',
        options: dayOptions,
      }),
    ],
    [dayOptions, initialExpense?.status, isEditing, memberOptions, mode],
  );

  const handleSubmit = async (data: ExpenseFormData) => {
    const parseAmount = (value: string) => {
      const parsed = Number(value);
      return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
    };
    const amount = mode === 'amount' ? parseAmount(data.amount) : null;
    const amountMin = mode === 'range' ? parseAmount(data.amountMin) : null;
    const amountMax = mode === 'range' ? parseAmount(data.amountMax) : null;
    const paidAmount =
      isEditing && mode === 'range' && initialExpense?.status === 'PAID'
        ? parseAmount(data.paidAmount)
        : null;

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
        paidAmount,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this expense.'));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete expense',
      message: `Delete "${initialExpense?.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await onDelete();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Expense'>
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
          <ModalFooterActions
            leftActions={
              isEditing &&
              onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
            }
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type='submit'
                  loading={isSubmitting}
                  disabled={isSubmitting || !isFormComplete}
                >
                  {isSubmitting
                    ? isEditing
                      ? 'Saving…'
                      : 'Adding…'
                    : isEditing
                      ? 'Save changes'
                      : 'Add expense'}
                </Button>
              </>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

export default ExpenseFormModal;
