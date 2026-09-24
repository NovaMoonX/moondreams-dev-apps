import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { getErrorMessage } from '@/utils/errorUtils';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import { ADD_NEW_OPTION } from '@apps/waypoint/constants';
import type {
  ExpenseCategory,
  ExpenseStatus,
  TripExpense,
  TripSpace,
} from '@apps/waypoint/types';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
  parseExpenseCategoryKey,
  toCustomCategoryKey,
} from '@apps/waypoint/utils/expenseCategories';

const PAID_BY_EACH_PERSON = '';

interface ChoiceValue {
  choice: string;
  newLabel: string;
}

interface AmountRange {
  min: string;
  max: string;
}

interface ExpenseFormData {
  title: string;
  category: ChoiceValue;
  amountMode: 'amount' | 'range';
  amount: string;
  amountRange: AmountRange;
  isPerPerson: boolean;
  payerUid: string;
  status: ExpenseStatus;
  dayIndex: string;
  paidAmount: string;
  note: string;
  group: ChoiceValue;
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
  isPerPerson: boolean;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  initialExpense?: TripExpense;
  categoryKeys: string[];
  existingGroupLabels: string[];
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { checkbox, custom, input, radio, select } = FormFactories;

function parseAmount(value: string): number | null {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

function resolveChoice({ choice, newLabel }: ChoiceValue): string | null {
  if (choice === ADD_NEW_OPTION || choice === '') {
    return newLabel.trim() || null;
  }
  return choice;
}

function getInitialFormData(initialExpense?: TripExpense): ExpenseFormData {
  return {
    title: initialExpense?.title ?? '',
    category: {
      choice: initialExpense ? getExpenseCategoryKey(initialExpense) : '',
      newLabel: '',
    },
    amountMode: initialExpense?.amount === null ? 'range' : 'amount',
    amount: initialExpense?.amount === null ? '' : String(initialExpense?.amount ?? ''),
    amountRange: {
      min: String(initialExpense?.amountMin ?? ''),
      max: String(initialExpense?.amountMax ?? ''),
    },
    isPerPerson: initialExpense?.isPerPerson ?? false,
    payerUid: initialExpense?.payerUid ?? PAID_BY_EACH_PERSON,
    status: initialExpense?.status ?? 'EXPECTED',
    dayIndex:
      initialExpense?.dayIndex === null || initialExpense?.dayIndex === undefined
        ? ''
        : String(initialExpense.dayIndex),
    paidAmount: String(initialExpense?.paidAmount ?? ''),
    note: initialExpense?.note ?? '',
    group: { choice: initialExpense?.groupLabel ?? '', newLabel: '' },
  };
}

function ExpenseFormModal({
  isOpen,
  trip,
  initialExpense,
  categoryKeys,
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
    getInitialFormData(initialExpense),
  );
  const [showGroupField, setShowGroupField] = useState(Boolean(initialExpense?.groupLabel));
  const [showNoteField, setShowNoteField] = useState(Boolean(initialExpense?.note));
  const isEditing = Boolean(initialExpense);
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const rangeMin = parseAmount(formData.amountRange.min);
  const rangeMax = parseAmount(formData.amountRange.max);
  const isFormComplete =
    formData.title.trim() !== '' &&
    resolveChoice(formData.category) !== null &&
    (mode === 'amount'
      ? parseAmount(formData.amount) !== null
      : rangeMin !== null && rangeMax !== null && rangeMax >= rangeMin);
  const dayOptions = useMemo(
    () => [
      { value: '', label: 'No specific day' },
      ...Array.from({ length: getDayCount(trip.startDate, trip.endDate) }, (_, index) => ({
        value: String(index),
        label: getDayLabel(trip.startDate, index),
      })),
    ],
    [trip.startDate, trip.endDate],
  );
  const payerOptions = useMemo(
    () => [
      { value: PAID_BY_EACH_PERSON, label: 'Paid by each person' },
      ...memberIds.map((uid) => ({
        value: uid,
        label: memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid,
      })),
    ],
    [memberIds, memberInfo],
  );
  const categoryOptions = useMemo(
    () => categoryKeys.map((key) => ({ value: key, text: getExpenseCategoryKeyLabel(key) })),
    [categoryKeys],
  );
  const groupOptions = useMemo(
    () => existingGroupLabels.map((label) => ({ value: label, text: label })),
    [existingGroupLabels],
  );

  const fields = useMemo(() => {
    const nextFields: FormField[] = [
      input({
        name: 'title',
        label: 'Expense title',
        placeholder: 'Dinner reservation',
        variant: 'outline',
      }),
      custom({
        name: 'category',
        label: 'Category',
        renderComponent: (props) => (
          <ChoiceField
            value={props.value as ChoiceValue}
            onValueChange={props.onValueChange as (value: ChoiceValue) => void}
            options={categoryOptions}
            placeholder='Choose a category'
            newPlaceholder='Souvenirs'
          />
        ),
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
      mode === 'amount'
        ? input({
            name: 'amount',
            label: formData.isPerPerson ? 'Amount per person' : 'Amount',
            type: 'number',
            placeholder: '0.00',
            variant: 'outline',
          })
        : custom({
            name: 'amountRange',
            label: formData.isPerPerson ? 'Estimated range per person' : 'Estimated range',
            renderComponent: (props) => {
              const range = props.value as AmountRange;
              return (
                <div className='grid grid-cols-2 gap-3'>
                  <Input
                    type='number'
                    aria-label='Minimum amount'
                    placeholder='Min'
                    variant='outline'
                    value={range.min}
                    onChange={(event) => props.onValueChange({ ...range, min: event.target.value })}
                  />
                  <Input
                    type='number'
                    aria-label='Maximum amount'
                    placeholder='Max'
                    variant='outline'
                    value={range.max}
                    onChange={(event) => props.onValueChange({ ...range, max: event.target.value })}
                  />
                </div>
              );
            },
          }),
      checkbox({
        name: 'isPerPerson',
        label: '',
        text: 'Per person — multiplied by everyone in the split',
      }),
    ];

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
      nextFields.push(select({ name: 'payerUid', label: 'Paid by', options: payerOptions }));
    }

    nextFields.push(select({ name: 'dayIndex', label: 'Trip day', options: dayOptions }));

    if (showGroupField) {
      nextFields.push(
        custom({
          name: 'group',
          label: 'Group',
          renderComponent: (props) => (
            <ChoiceField
              value={props.value as ChoiceValue}
              onValueChange={props.onValueChange as (value: ChoiceValue) => void}
              options={groupOptions}
              placeholder='Choose a group'
              newPlaceholder='Dinner at Ichiran'
            />
          ),
        }),
      );
    }

    if (showNoteField) {
      nextFields.push(
        custom({
          name: 'note',
          label: 'Note',
          renderComponent: (props) => (
            <Textarea
              rows={2}
              value={props.value as string}
              onChange={(event) => props.onValueChange(event.target.value)}
              variant='outline'
              placeholder='Anything worth remembering about this expense'
            />
          ),
        }),
      );
    }

    return nextFields;
  }, [
    categoryOptions,
    dayOptions,
    formData.isPerPerson,
    formData.status,
    groupOptions,
    initialExpense?.status,
    isEditing,
    mode,
    payerOptions,
    showGroupField,
    showNoteField,
  ]);

  const handleSubmit = async (data: ExpenseFormData) => {
    const amount = mode === 'amount' ? parseAmount(data.amount) : null;
    const amountMin = mode === 'range' ? parseAmount(data.amountRange.min) : null;
    const amountMax = mode === 'range' ? parseAmount(data.amountRange.max) : null;
    const paidAmount =
      isEditing && mode === 'range' && initialExpense?.status === 'PAID'
        ? parseAmount(data.paidAmount)
        : null;
    const categoryChoice = resolveChoice(data.category);

    if (
      !data.title.trim() ||
      categoryChoice === null ||
      (mode === 'amount' && amount === null) ||
      (mode === 'range' && (amountMin === null || amountMax === null))
    ) {
      setError('Enter a title, a category, and a valid amount.');
      return;
    }

    const categoryKey =
      data.category.choice === ADD_NEW_OPTION ? toCustomCategoryKey(categoryChoice) : categoryChoice;
    const { category, customCategoryLabel } = parseExpenseCategoryKey(categoryKey);

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
        currency: 'USD',
        paidAmount,
        category,
        customCategoryLabel,
        note: showNoteField ? data.note.trim() || null : null,
        groupLabel: showGroupField ? resolveChoice(data.group) : null,
        isPerPerson: data.isPerPerson,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this expense.'));
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
          <div className='col-span-full space-y-4'>
            {(!showGroupField || !showNoteField) && (
              <div className='flex flex-wrap gap-x-4 gap-y-1'>
                {!showGroupField && (
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='h-auto p-0'
                    onClick={() => setShowGroupField(true)}
                  >
                    + Add to a group
                  </Button>
                )}
                {!showNoteField && (
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='h-auto p-0'
                    onClick={() => setShowNoteField(true)}
                  >
                    + Add note
                  </Button>
                )}
              </div>
            )}
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
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Modal>
  );
}

function ChoiceField({
  value,
  onValueChange,
  options,
  placeholder,
  newPlaceholder,
}: {
  value: ChoiceValue;
  onValueChange: (value: ChoiceValue) => void;
  options: { value: string; text: string }[];
  placeholder: string;
  newPlaceholder: string;
}) {
  const isAddingNew = options.length === 0 || value.choice === ADD_NEW_OPTION;

  return (
    <div className='space-y-2'>
      {options.length > 0 && (
        <Select
          options={[...options, { value: ADD_NEW_OPTION, text: 'Add new…' }]}
          value={value.choice}
          placeholder={placeholder}
          onChange={(choice) => onValueChange({ ...value, choice })}
        />
      )}
      {isAddingNew && (
        <Input
          value={value.newLabel}
          placeholder={newPlaceholder}
          variant='outline'
          onChange={(event) => onValueChange({ ...value, newLabel: event.target.value })}
        />
      )}
    </div>
  );
}

export default ExpenseFormModal;
