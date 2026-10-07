import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import type { FormField } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { getErrorMessage } from '@/utils/errorUtils';
import { useAppSelector } from '@/store';
import { selectSortedRentals, selectSortedStays, selectSortedTimelineEvents } from '@apps/waypoint/store/selectors';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getDayCount, getDayLabel, getDayOptions } from '@/utils/dateRangeUtils';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { getEarlyPayments } from '@apps/waypoint/utils/splitCalculators';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type {
  ExpenseCategory,
  ExpenseLink,
  ExpenseStatus,
  TripExpense,
  TripSpace,
} from '@apps/waypoint/types';
import { getExpenseLinkKey, getLinkableSubjects } from '@apps/waypoint/utils/relatedSubjects';
import {
  getExpenseCategoryKey,
  getExpenseCategoryKeyLabel,
  parseExpenseCategoryKey,
  toCustomCategoryKey,
} from '@apps/waypoint/utils/expenseCategories';

const PAID_BY_EACH_PERSON = '';

const LINK_KIND_LABELS: Record<ExpenseLink['kind'], string> = {
  EVENT: 'Event',
  STAY: 'Stay',
  RENTAL: 'Rental',
};

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
  linkedTo: ExpenseLink | null;
}

export interface ExpensePrefill {
  link: ExpenseLink;
  title: string;
  dayIndex: number | null;
  category: ExpenseCategory | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  initialExpense?: TripExpense;
  prefill?: ExpensePrefill;
  categoryKeys: string[];
  existingGroupLabels: string[];
  isSubmitting?: boolean;
  onSubmit: (values: ExpenseSubmitValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

const { custom, input, select } = FormFactories;

function parseAmount(value: string): number | null {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

function resolveChoice({ choice, newLabel }: ChoiceValue): string | null {
  if (choice === NEW_CHOICE || choice === '') {
    return newLabel.trim() || null;
  }
  return choice;
}

function getDayValue(dayIndex: number | null | undefined): string {
  return dayIndex === null || dayIndex === undefined ? '' : String(dayIndex);
}

function getInitialFormData(initialExpense?: TripExpense, prefill?: ExpensePrefill): ExpenseFormData {
  return {
    title: initialExpense?.title ?? prefill?.title ?? '',
    category: {
      choice: initialExpense ? getExpenseCategoryKey(initialExpense) : (prefill?.category ?? ''),
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
    dayIndex: getDayValue(initialExpense ? initialExpense.dayIndex : prefill?.dayIndex),
    paidAmount: String(initialExpense?.paidAmount ?? ''),
    note: initialExpense?.note ?? '',
    group: { choice: initialExpense?.groupLabel ?? '', newLabel: '' },
  };
}

function ExpenseFormModal({
  isOpen,
  trip,
  initialExpense,
  prefill,
  categoryKeys,
  existingGroupLabels,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const events = useAppSelector(selectSortedTimelineEvents);
  const stays = useAppSelector(selectSortedStays);
  const rentals = useAppSelector(selectSortedRentals);
  const linkables = useMemo(
    () => (isOpen && !prefill ? getLinkableSubjects(trip, events, stays, rentals) : []),
    [isOpen, prefill, trip, events, stays, rentals],
  );
  const [mode, setMode] = useState<ExpenseFormData['amountMode']>(
    initialExpense?.amount === null ? 'range' : 'amount',
  );
  const [formData, setFormData] = useState<ExpenseFormData>(() =>
    getInitialFormData(initialExpense, prefill),
  );
  // The form reads its data once, so picking an event remounts it with the filled-in values.
  const [formKey, setFormKey] = useState(0);
  const [link, setLink] = useState<ExpenseLink | null>(initialExpense?.linkedTo ?? prefill?.link ?? null);
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
  const linkKey = link ? getExpenseLinkKey(link) : '';
  const pickedSubject = linkables.find((subject) => getExpenseLinkKey(subject.link) === linkKey);
  const storedDayIndex = initialExpense?.dayIndex ?? pickedSubject?.dayIndex ?? prefill?.dayIndex ?? null;
  const linkOptions = useMemo(
    () =>
      linkables.map((subject) => ({
        value: getExpenseLinkKey(subject.link),
        text: `${subject.emoji} ${subject.title}`,
        description: `${LINK_KIND_LABELS[subject.link.kind]} · ${
          subject.dayIndex === null
            ? 'No specific day'
            : getDayLabel(trip.startDate, subject.dayIndex, getDayCount(trip.startDate, trip.endDate))
        }`,
      })),
    [linkables, trip.startDate, trip.endDate],
  );
  const showLinkPicker = linkOptions.length > 0;
  const dayOptions = useMemo(
    () => [
      { value: '', label: 'No specific day' },
      ...getDayOptions(trip.startDate, trip.endDate, storedDayIndex, MAX_DAYS_OUTSIDE_TRIP),
    ],
    [trip.startDate, trip.endDate, storedDayIndex],
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
            label='Category'
            options={categoryOptions}
            newPillLabel='New category'
            newPlaceholder='Souvenirs'
          />
        ),
      }),
      custom({
        name: 'amountMode',
        label: 'Amount type',
        renderComponent: (props) => (
          <PillGroup
            label='Amount type'
            options={[
              { value: 'amount', label: 'Known amount', emoji: '🧾' },
              { value: 'range', label: 'Estimated range', emoji: '🔮' },
            ]}
            value={props.value as ExpenseFormData['amountMode']}
            onChange={(value) => {
              setMode(value);
              props.onValueChange(value);
            }}
          />
        ),
      }),
      custom({
        name: 'isPerPerson',
        label: 'This price is for',
        renderComponent: (props) => (
          <div className='space-y-1.5'>
            <PillGroup
              label='This price is for'
              options={[
                { value: 'group', label: 'The whole group', emoji: '👥' },
                { value: 'each', label: 'Each person', emoji: '🙋' },
              ]}
              value={props.value === true ? 'each' : 'group'}
              onChange={(value) => props.onValueChange(value === 'each')}
            />
            <p className='text-muted-foreground text-xs'>
              {props.value === true
                ? 'Everyone in the split pays this much, so the total grows with every person who joins.'
                : 'We work out everyone’s share for you.'}
            </p>
          </div>
        ),
      }),
      mode === 'amount'
        ? input({
            name: 'amount',
            label: formData.isPerPerson ? 'What each person pays' : 'Total for the group',
            type: 'number',
            placeholder: '0.00',
            variant: 'outline',
          })
        : custom({
            name: 'amountRange',
            label: formData.isPerPerson ? 'What each person might pay' : 'Estimated total for the group',
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
    ];

    if (isEditing && mode === 'range' && initialExpense?.status === 'PAID') {
      nextFields.push(
        input({
          name: 'paidAmount',
          label: formData.isPerPerson ? 'What each person paid' : 'What the group paid',
          type: 'number',
          placeholder: '0.00',
          variant: 'outline',
        }),
      );
    }

    nextFields.push(
      custom({
        name: 'status',
        label: 'Status',
        renderComponent: (props) => (
          <PillGroup
            label='Status'
            options={[
              { value: 'EXPECTED', label: 'Expected', emoji: '⏳' },
              { value: 'PAID', label: 'Paid', emoji: '💸' },
            ]}
            value={props.value as ExpenseFormData['status']}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
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
              label='Group'
              options={groupOptions}
              newPillLabel='New group'
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

  const pickLink = (nextKey: string) => {
    const picked = linkables.find((subject) => getExpenseLinkKey(subject.link) === nextKey);
    if (!picked) {
      return;
    }

    setLink(picked.link);
    if (isEditing) {
      return;
    }
    setFormData((current) => ({
      ...current,
      title: picked.title,
      dayIndex: getDayValue(picked.dayIndex),
      category:
        picked.expenseCategory && current.category.choice === ''
          ? { choice: picked.expenseCategory, newLabel: '' }
          : current.category,
    }));
    setFormKey((key) => key + 1);
  };

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
      data.category.choice === NEW_CHOICE ? toCustomCategoryKey(categoryChoice) : categoryChoice;
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
        linkedTo: link,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this expense.'));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    if (initialExpense && Object.keys(getEarlyPayments(initialExpense)).length > 0) {
      setError('Someone recorded paying toward this early. Remove it from the Dues summary (Remove, next to the early payment) before deleting.');
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
    <FormSheet isOpen={isOpen} onClose={onClose} title='Expense'>
      {showLinkPicker && (
        <div className='mb-4 space-y-1.5'>
          <Label>What is this paying for?</Label>
          <Select
            searchable
            clearable
            options={linkOptions}
            value={linkKey}
            placeholder='Pick an event, stay or rental'
            searchPlaceholder='Search your plans'
            onChange={(value) => (value === '' ? setLink(null) : pickLink(value))}
          />
        </div>
      )}
      <Form
        key={formKey}
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
              cancelAction={
                  <Button type='button' variant='secondary' onClick={onClose}>
                    Cancel
                  </Button>
              }
              rightActions={
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
                        ? 'Save'
                        : 'Add'}
                  </Button>
              }
            />
          </div>
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}

function ChoiceField({
  label,
  value,
  onValueChange,
  options,
  newPillLabel,
  newPlaceholder,
}: {
  label: string;
  value: ChoiceValue;
  onValueChange: (value: ChoiceValue) => void;
  options: { value: string; text: string }[];
  newPillLabel: string;
  newPlaceholder: string;
}) {
  return (
    <PickOrCreate
      label={label}
      options={options.map((option) => ({ value: option.value, label: option.text }))}
      choice={value.choice}
      newText={value.newLabel}
      newPillLabel={newPillLabel}
      newPlaceholder={newPlaceholder}
      onChange={(choice, newLabel) => onValueChange({ choice, newLabel })}
    />
  );
}

export default ExpenseFormModal;
