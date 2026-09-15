import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo, useState } from 'react';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import type { Expense } from '@apps/nine-lives/types';

import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '../utils/budgetCalculators';

interface ExpenseFormValues {
  catIds: string[];
  category: string;
  incurredAt: string;
  amount: string;
  isRecurring: boolean;
  recurrenceInterval?: string;
  notes?: string | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  /** Renders a "Cats" checkbox group as the first field so the expense can be attached to multiple cats. */
  catOptions: { label: string; value: string }[];
  initialExpense?: Partial<Expense> | null;
  isSubmitting?: boolean;
  onSubmit: (
    expense: Partial<Expense> &
      Pick<Expense, 'catIds' | 'category' | 'amount' | 'isRecurring' | 'incurredAt'>,
  ) => Promise<void> | void;
  onDelete?: (expenseId: string) => Promise<void> | void;
  onClose?: () => void;
}

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const { checkbox, checkboxGroup, input, select, textarea, custom } = FormFactories;

function ExpenseFormModal({
  isOpen,
  catOptions,
  initialExpense,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const formId = initialExpense?.id ?? 'new-nine-lives-expense';
  const isEditing = Boolean(initialExpense?.id);

  const [isRecurring, setIsRecurring] = useState(Boolean(initialExpense?.isRecurring));
  const [notesOpen, setNotesOpen] = useState(Boolean(initialExpense?.notes));
  const [isValid, setIsValid] = useState(
    Boolean(
      initialExpense?.catIds?.length &&
        initialExpense?.category &&
        initialExpense?.incurredAt &&
        initialExpense?.amount,
    ),
  );

  const categoryOptions = useMemo(
    () =>
      DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
        label: getExpenseCategoryLabel(category),
        value: category,
      })),
    [],
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
      select({
        name: 'category',
        label: 'Category',
        options: categoryOptions,
      }),
      createDateInputField({
        name: 'incurredAt',
        label: 'Date incurred',
        variant: 'outline',
      }),
      input({
        name: 'amount',
        label: 'Amount',
        type: 'number',
        placeholder: '72.00',
        variant: 'outline',
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
    [catOptions, categoryOptions, recurrenceOptions, isRecurring, notesOpen],
  );

  const initialData = useMemo(
    () => ({
      catIds: initialExpense?.catIds ?? [],
      category: initialExpense?.category ?? DEFAULT_EXPENSE_CATEGORIES[0],
      incurredAt: toDateInputValue(initialExpense?.incurredAt ?? undefined),
      amount: initialExpense?.amount ? String(initialExpense.amount) : '',
      isRecurring: Boolean(initialExpense?.isRecurring),
      recurrenceInterval: initialExpense?.recurrenceInterval ?? 'monthly',
      notes: initialExpense?.notes ?? '',
    }),
    [initialExpense],
  );

  const handleSubmit = async (data: ExpenseFormValues) => {
    const amount = Number(data.amount);
    const incurredAt = fromDateInputValue(data.incurredAt);
    const catIds = data.catIds.length > 0 ? data.catIds : initialExpense?.catIds ?? [];

    if (
      catIds.length === 0 ||
      !data.category ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      incurredAt === undefined
    ) {
      return;
    }

    await onSubmit({
      id: initialExpense?.id,
      catIds,
      category: data.category as Expense['category'],
      amount,
      isRecurring: Boolean(data.isRecurring),
      recurrenceInterval: data.isRecurring
        ? (data.recurrenceInterval === 'yearly' ? 'yearly' : 'monthly')
        : null,
      incurredAt,
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
      title={initialExpense?.id ? 'Edit expense' : 'Add expense'}
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

          const amount = Number(values.amount);
          const hasCat = values.catIds.length > 0 || Boolean(initialExpense?.catIds?.length);
          const nextIsValid = Boolean(
            hasCat &&
              values.category &&
              values.incurredAt &&
              Number.isFinite(amount) &&
              amount > 0,
          );

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
