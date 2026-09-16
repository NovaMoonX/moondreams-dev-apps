import { Button, Form, FormFactories, Input, Modal, Select } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo, useState } from 'react';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import { selectVisitsByHousehold } from '../store/selectors';
import type { Expense, ExpenseLineItem } from '../types';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  calculateExpenseItemsTotal,
  getExpenseCategoryLabel,
  getRecurringCycleCount,
} from '../utils/budgetCalculators';
import { getVisitOptions } from '../utils/visitOptions';

interface LineItemValue {
  id: string;
  category: string;
  label: string;
  amount: string;
}

interface ExpenseFormValues {
  catIds: string[];
  items: LineItemValue[];
  label?: string | null;
  incurredAt: string;
  isRecurring: boolean;
  recurrenceInterval?: string;
  isStopped?: boolean;
  recurrenceEndedAt?: string;
  visitId?: string | null;
  notes?: string | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  householdId?: string;
  /** Renders a "Cats" checkbox group as the first field so the expense can be attached to multiple cats. */
  catOptions: { label: string; value: string }[];
  initialExpense?: Partial<Expense> | null;
  isSubmitting?: boolean;
  onSubmit: (
    expense: Partial<Expense> & Pick<Expense, 'catIds' | 'items' | 'isRecurring' | 'incurredAt'>,
  ) => Promise<void> | void;
  onDelete?: (expenseId: string) => Promise<void> | void;
  onClose?: () => void;
}

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const { checkbox, checkboxGroup, custom, input, select, textarea } = FormFactories;

function createEmptyLineItem(): LineItemValue {
  return { id: crypto.randomUUID(), category: DEFAULT_EXPENSE_CATEGORIES[0], label: '', amount: '' };
}

function getInitialLineItems(expense: Partial<Expense> | null | undefined): LineItemValue[] {
  if (!expense?.items || expense.items.length === 0) {
    return [createEmptyLineItem()];
  }

  return expense.items.map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label ?? '',
    amount: String(item.amount),
  }));
}

function LineItemsField({
  value,
  onValueChange,
  disabled,
  categoryOptions,
}: {
  value: LineItemValue[];
  onValueChange: (value: LineItemValue[]) => void;
  disabled?: boolean;
  categoryOptions: { text: string; value: string }[];
}) {
  const updateItem = (id: string, changes: Partial<LineItemValue>) => {
    onValueChange(value.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  const removeItem = (id: string) => {
    onValueChange(value.filter((item) => item.id !== id));
  };

  const total = value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <div className='space-y-3'>
      {value.map((item, index) => (
        <div key={item.id} className='border-border space-y-2 rounded-md border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
              Item {index + 1}
            </span>
            {value.length > 1 && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => removeItem(item.id)}
                disabled={disabled}
              >
                Remove
              </Button>
            )}
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <Select
              options={categoryOptions}
              value={item.category}
              disabled={disabled}
              onChange={(category) => updateItem(item.id, { category })}
            />
            <Input
              value={item.amount}
              onChange={(event) => updateItem(item.id, { amount: event.target.value })}
              placeholder='72.00'
              type='number'
              variant='outline'
              disabled={disabled}
            />
          </div>
          <Input
            value={item.label}
            onChange={(event) => updateItem(item.id, { label: event.target.value })}
            placeholder='e.g. Exam fee (optional)'
            variant='outline'
            disabled={disabled}
          />
        </div>
      ))}
      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={mutedLinkClassName}
          onClick={() => onValueChange([...value, createEmptyLineItem()])}
          disabled={disabled}
        >
          + Add line item
        </Button>
        <span className='text-sm font-semibold'>Total: {currencyFormatter.format(total)}</span>
      </div>
    </div>
  );
}

function ExpenseFormModal({
  isOpen,
  householdId,
  catOptions,
  initialExpense,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const formId = initialExpense?.id ?? 'new-nine-lives-expense';
  const isEditing = Boolean(initialExpense?.id);

  const [isRecurring, setIsRecurring] = useState(Boolean(initialExpense?.isRecurring));
  const [isStopped, setIsStopped] = useState(Boolean(initialExpense?.recurrenceEndedAt));
  const [cycleCount, setCycleCount] = useState(() =>
    initialExpense?.recurrenceEndedAt && initialExpense.incurredAt
      ? getRecurringCycleCount({
          isRecurring: true,
          incurredAt: initialExpense.incurredAt,
          recurrenceInterval: initialExpense.recurrenceInterval ?? 'monthly',
          recurrenceEndedAt: initialExpense.recurrenceEndedAt,
        })
      : 0,
  );
  const [labelOpen, setLabelOpen] = useState(Boolean(initialExpense?.label));
  const [notesOpen, setNotesOpen] = useState(Boolean(initialExpense?.notes));
  const [isValid, setIsValid] = useState(
    Boolean(initialExpense?.catIds?.length && initialExpense?.items?.length && initialExpense?.incurredAt),
  );

  const categoryOptions = useMemo(
    () =>
      DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
        text: getExpenseCategoryLabel(category),
        value: category,
      })),
    [],
  );

  const visitOptions = useMemo(
    () => [{ label: 'None', value: '' }, ...getVisitOptions(visits)],
    [visits],
  );

  const recurrenceOptions = useMemo(
    () => [
      { label: 'Monthly', value: 'monthly' },
      { label: 'Yearly', value: 'yearly' },
    ],
    [],
  );

  const fields = useMemo(
    () => [
      checkboxGroup({
        name: 'catIds',
        label: 'Cats',
        options: catOptions,
      }),
      custom({
        name: 'items',
        label: 'Line items',
        renderComponent: (props) => (
          <LineItemsField
            value={props.value as LineItemValue[]}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
            categoryOptions={categoryOptions}
          />
        ),
        colSpan: 'full',
      }),
      labelOpen
        ? input({
            name: 'label',
            label: 'Label',
            placeholder: 'e.g. Annual wellness visit',
            variant: 'outline',
          })
        : custom({
            name: '_addLabel',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setLabelOpen(true)}
              >
                + Add label
              </Button>
            ),
          }),
      createDateInputField({
        name: 'incurredAt',
        label: isRecurring ? 'Date started' : 'Date incurred',
        variant: 'outline',
      }),
      select({
        name: 'visitId',
        label: 'Linked visit (optional)',
        options: visitOptions,
      }),
      checkbox({
        name: 'isRecurring',
        label: '',
        text: 'This is a recurring expense',
      }),
      ...(isRecurring
        ? [
            select({
              name: 'recurrenceInterval',
              label: 'Billing cadence',
              options: recurrenceOptions,
            }),
            ...(isEditing
              ? [
                  checkbox({
                    name: 'isStopped',
                    label: '',
                    text: 'This recurring expense has stopped',
                  }),
                  ...(isStopped
                    ? [
                        createDateInputField({
                          name: 'recurrenceEndedAt',
                          label: 'Stopped on',
                          variant: 'outline',
                        }),
                        custom({
                          name: '_cycleCountInfo',
                          label: '',
                          renderComponent: () => (
                            <p className='text-muted-foreground text-sm'>
                              Billed {cycleCount} time{cycleCount === 1 ? '' : 's'} before stopping.
                            </p>
                          ),
                        }),
                      ]
                    : []),
                ]
              : []),
          ]
        : []),
      notesOpen
        ? textarea({
            name: 'notes',
            label: 'Notes',
            placeholder: 'Vet visit, food refill, or other context',
            rows: 3,
            variant: 'outline',
          })
        : custom({
            name: '_addNotes',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setNotesOpen(true)}
              >
                + Add notes
              </Button>
            ),
          }),
    ],
    [
      catOptions,
      categoryOptions,
      visitOptions,
      recurrenceOptions,
      isRecurring,
      isEditing,
      isStopped,
      cycleCount,
      labelOpen,
      notesOpen,
    ],
  );

  const initialData = useMemo(
    () => ({
      catIds: initialExpense?.catIds ?? [],
      items: getInitialLineItems(initialExpense),
      label: initialExpense?.label ?? '',
      incurredAt: toDateInputValue(initialExpense?.incurredAt ?? undefined),
      visitId: initialExpense?.visitId ?? '',
      isRecurring: Boolean(initialExpense?.isRecurring),
      recurrenceInterval: initialExpense?.recurrenceInterval ?? 'monthly',
      isStopped: Boolean(initialExpense?.recurrenceEndedAt),
      recurrenceEndedAt: toDateInputValue(initialExpense?.recurrenceEndedAt ?? undefined),
      notes: initialExpense?.notes ?? '',
    }),
    [initialExpense],
  );

  const handleSubmit = async (data: ExpenseFormValues) => {
    const incurredAt = fromDateInputValue(data.incurredAt);
    const catIds = data.catIds.length > 0 ? data.catIds : initialExpense?.catIds ?? [];

    const items: ExpenseLineItem[] = data.items
      .map((item) => ({
        id: item.id,
        category: item.category as Expense['items'][number]['category'],
        label: item.label.trim() || null,
        amount: Number(item.amount),
      }))
      .filter((item) => Number.isFinite(item.amount) && item.amount > 0);

    if (catIds.length === 0 || items.length === 0 || incurredAt === undefined) {
      return;
    }

    await onSubmit({
      id: initialExpense?.id,
      catIds,
      items,
      amount: calculateExpenseItemsTotal(items),
      label: data.label?.trim() || null,
      isRecurring: Boolean(data.isRecurring),
      recurrenceInterval: data.isRecurring
        ? (data.recurrenceInterval === 'yearly' ? 'yearly' : 'monthly')
        : null,
      recurrenceEndedAt:
        data.isRecurring && data.isStopped
          ? fromDateInputValue(data.recurrenceEndedAt ?? '') ?? null
          : null,
      incurredAt,
      visitId: data.visitId?.trim() || null,
      notes: data.notes?.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialExpense?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete expense',
      message: `Are you sure you want to delete this expense?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialExpense.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title={
        initialExpense?.id
          ? 'Edit expense'
          : initialExpense?.visitId
            ? 'Log an expense for this visit?'
            : 'Add expense'
      }
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={initialData}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as ExpenseFormValues;
          const nextIsRecurring = Boolean(values.isRecurring);

          if (nextIsRecurring !== isRecurring) {
            setIsRecurring(nextIsRecurring);
          }

          const nextIsStopped = Boolean(values.isStopped);

          if (nextIsStopped !== isStopped) {
            setIsStopped(nextIsStopped);
          }

          if (nextIsRecurring && nextIsStopped) {
            const incurredAtValue = fromDateInputValue(values.incurredAt);
            const recurrenceEndedAtValue = fromDateInputValue(values.recurrenceEndedAt ?? '');

            setCycleCount(
              incurredAtValue !== undefined && recurrenceEndedAtValue !== undefined
                ? getRecurringCycleCount({
                    isRecurring: true,
                    incurredAt: incurredAtValue,
                    recurrenceInterval: values.recurrenceInterval === 'yearly' ? 'yearly' : 'monthly',
                    recurrenceEndedAt: recurrenceEndedAtValue,
                  })
                : 0,
            );
          }

          const hasCat = values.catIds.length > 0 || Boolean(initialExpense?.catIds?.length);
          const hasValidItem = values.items.some((item) => {
            const amount = Number(item.amount);
            return Number.isFinite(amount) && amount > 0;
          });
          const nextIsValid = Boolean(hasCat && hasValidItem && values.incurredAt);

          setIsValid(nextIsValid);
        }}
        onSubmit={(data) => {
          void handleSubmit(data as ExpenseFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              {isEditing && onDelete && (
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                >
                  Delete
                </Button>
              )}
            </div>
            <div className='flex justify-end'>
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : initialExpense?.id ? 'Save expense' : 'Add expense'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

export default ExpenseFormModal;
