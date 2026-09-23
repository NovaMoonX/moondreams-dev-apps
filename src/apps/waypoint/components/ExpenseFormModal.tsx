import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
  Tabs,
  Textarea,
  Tooltip,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { InfoCircled } from '@moondreamsdev/dreamer-ui/symbols';

import { getErrorMessage } from '@/utils/errorUtils';
import { useUserInfo } from '@/hooks/useUserInfo';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@apps/waypoint/constants';
import type {
  ExpenseCategory,
  ExpenseStatus,
  TripExpense,
  TripSpace,
} from '@apps/waypoint/types';

const PAID_BY_EACH_PERSON = '';

interface ExpenseFormData {
  title: string;
  category: ExpenseCategory;
  customCategoryLabel: string;
  amountMode: 'amount' | 'range';
  amount: string;
  amountMin: string;
  amountMax: string;
  currency: string;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: string;
  paidAmount: string;
  note: string;
  groupLabel: string;
}

export interface ExpenseSubmitValues {
  title: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  payerUid: string | null;
  status: ExpenseStatus;
  dayIndex: number | null;
  currency: string;
  paidAmount: number | null;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  note: string | null;
  groupLabel: string | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  initialExpense?: TripExpense;
  existingGroupLabels: string[];
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, radio, select } = FormFactories;

function getDayCount(trip: TripSpace) {
  return Math.floor((trip.endDate - trip.startDate) / 86_400_000) + 1;
}

function getInitialFormData(trip: TripSpace, initialExpense?: TripExpense): ExpenseFormData {
  return {
    title: initialExpense?.title ?? '',
    category: initialExpense?.category ?? 'OTHER',
    customCategoryLabel: initialExpense?.customCategoryLabel ?? '',
    amountMode: initialExpense?.amount === null ? 'range' : 'amount',
    amount: initialExpense?.amount === null ? '' : String(initialExpense?.amount ?? ''),
    amountMin: String(initialExpense?.amountMin ?? ''),
    amountMax: String(initialExpense?.amountMax ?? ''),
    currency: initialExpense?.currency ?? trip.defaultCurrency ?? 'USD',
    payerUid: initialExpense?.payerUid ?? PAID_BY_EACH_PERSON,
    status: initialExpense?.status ?? 'EXPECTED',
    dayIndex:
      initialExpense?.dayIndex === null || initialExpense?.dayIndex === undefined
        ? ''
        : String(initialExpense.dayIndex),
    paidAmount: String(initialExpense?.paidAmount ?? ''),
    note: initialExpense?.note ?? '',
    groupLabel: initialExpense?.groupLabel ?? '',
  };
}

function ExpenseFormModal({
  isOpen,
  trip,
  initialExpense,
  existingGroupLabels,
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
  const [formData, setFormData] = useState<ExpenseFormData>(() =>
    getInitialFormData(trip, initialExpense),
  );
  const [showCurrencyField, setShowCurrencyField] = useState(
    Boolean(initialExpense?.currency && initialExpense.currency !== (trip.defaultCurrency ?? 'USD')),
  );
  const [showGroupField, setShowGroupField] = useState(Boolean(initialExpense?.groupLabel));
  const [showNoteField, setShowNoteField] = useState(Boolean(initialExpense?.note));
  const isEditing = Boolean(initialExpense);
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const parsedAmount = Number(formData.amount);
  const parsedAmountMin = Number(formData.amountMin);
  const parsedAmountMax = Number(formData.amountMax);
  const isFormComplete =
    formData.title.trim() !== '' &&
    (formData.category !== 'OTHER' || formData.customCategoryLabel.trim() !== '') &&
    (mode === 'amount'
      ? formData.amount.trim() !== '' && Number.isFinite(parsedAmount)
      : formData.amountMin.trim() !== '' &&
        formData.amountMax.trim() !== '' &&
        Number.isFinite(parsedAmountMin) &&
        Number.isFinite(parsedAmountMax) &&
        parsedAmountMax >= parsedAmountMin) &&
    formData.currency.trim() !== '';
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
  const payerOptions = useMemo(
    () => [{ value: PAID_BY_EACH_PERSON, label: 'Paid by each person' }, ...memberOptions],
    [memberOptions],
  );

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({
        name: 'title',
        label: 'Expense title',
        placeholder: 'Dinner reservation',
        variant: 'outline',
      }),
      select({
        name: 'category',
        label: 'Category',
        options: EXPENSE_CATEGORIES.map((category) => ({
          value: category,
          label: EXPENSE_CATEGORY_LABELS[category],
        })),
      }),
    ];

    if (formData.category === 'OTHER') {
      nextFields.push(
        input({
          name: 'customCategoryLabel',
          label: 'Custom category label',
          placeholder: 'Souvenirs',
          variant: 'outline',
        }),
      );
    }

    nextFields.push(
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
    );

    if (mode === 'amount') {
      nextFields.push(
        input({
          name: 'amount',
          label: 'Amount',
          type: 'number',
          placeholder: '0.00',
          variant: 'outline',
        }),
      );
    } else {
      nextFields.push(
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
      );
    }

    if (isEditing && mode === 'range' && initialExpense?.status === 'PAID') {
      nextFields.push(
        input({
          name: 'paidAmount',
          label: 'Paid amount',
          type: 'number',
          placeholder: '0.00',
          variant: 'outline',
        }),
      );
    }

    nextFields.push(
      radio({
        name: 'status',
        label: 'Status',
        options: [
          { value: 'EXPECTED', label: 'Expected' },
          { value: 'PAID', label: 'Paid' },
        ],
      }),
    );

    if (formData.status === 'PAID') {
      nextFields.push(
        select({
          name: 'payerUid',
          label: 'Paid by',
          options: payerOptions,
        }),
      );
    }

    if (!isEditing) {
      nextFields.push(
        custom({
          name: 'currency',
          label: 'Currency',
          renderComponent: (props) =>
            showCurrencyField ? (
              <Input
                value={props.value as string}
                placeholder='USD'
                variant='outline'
                onChange={(event) => props.onValueChange(event.target.value)}
              />
            ) : (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => setShowCurrencyField(true)}
              >
                + Use a different currency
              </Button>
            ),
        }),
      );
    }

    nextFields.push(
      select({
        name: 'dayIndex',
        label: 'Trip day',
        options: dayOptions,
      }),
    );

    nextFields.push(
      custom({
        name: 'groupLabel',
        label: 'Group',
        renderComponent: (props) => (
          <GroupField
            value={props.value as string}
            onValueChange={props.onValueChange as (value: string) => void}
            isVisible={showGroupField}
            onReveal={() => setShowGroupField(true)}
            suggestions={existingGroupLabels}
          />
        ),
      }),
    );

    nextFields.push(
      custom({
        name: 'note',
        label: 'Note',
        renderComponent: (props) =>
          showNoteField ? (
            <Textarea
              rows={2}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
              variant='outline'
              placeholder='Anything worth remembering about this expense'
            />
          ) : (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0'
              onClick={() => setShowNoteField(true)}
            >
              + Add note
            </Button>
          ),
      }),
    );

    return nextFields;
  }, [
    dayOptions,
    existingGroupLabels,
    formData.category,
    formData.status,
    initialExpense?.status,
    isEditing,
    mode,
    payerOptions,
    showCurrencyField,
    showGroupField,
    showNoteField,
  ]);

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
    const customCategoryLabel =
      data.category === 'OTHER' ? data.customCategoryLabel.trim() : null;

    if (
      !data.title.trim() ||
      (mode === 'amount' && amount === null) ||
      (mode === 'range' && (amountMin === null || amountMax === null)) ||
      (data.category === 'OTHER' && !customCategoryLabel)
    ) {
      setError('Enter a title, a valid amount, and a category.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        title: data.title,
        amount,
        amountMin,
        amountMax,
        payerUid: data.status === 'PAID' && data.payerUid !== '' ? data.payerUid : null,
        status: data.status,
        dayIndex: data.dayIndex === '' ? null : Number(data.dayIndex),
        currency: showCurrencyField ? data.currency : (trip.defaultCurrency ?? 'USD'),
        paidAmount,
        category: data.category,
        customCategoryLabel,
        note: data.note.trim() || null,
        groupLabel: data.groupLabel.trim() || null,
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
              onDelete && (
                <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
              )
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

function GroupField({
  value,
  onValueChange,
  isVisible,
  onReveal,
  suggestions,
}: {
  value: string;
  onValueChange: (value: string) => void;
  isVisible: boolean;
  onReveal: () => void;
  suggestions: string[];
}) {
  if (!isVisible) {
    return (
      <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={onReveal}>
        + Add to a group
      </Button>
    );
  }

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-1.5'>
        <span className='text-sm font-medium'>Group</span>
        <Tooltip
          message={
            <div className='max-w-56 text-xs'>
              Group related expenses — like itemized entries off one receipt — so
              their totals roll up together. Use the same name to add another
              expense to this group.
            </div>
          }
          placement='top'
        >
          <InfoCircled className='text-muted-foreground h-3.5 w-3.5 cursor-help' />
        </Tooltip>
      </div>
      <Input
        list='waypoint-expense-group-suggestions'
        value={value}
        placeholder='Dinner at Ichiran'
        variant='outline'
        onChange={(event) => onValueChange(event.target.value)}
      />
      <datalist id='waypoint-expense-group-suggestions'>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </div>
  );
}

export default ExpenseFormModal;
