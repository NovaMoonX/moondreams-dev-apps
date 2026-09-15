import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo } from 'react';

import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';

import type { Expense } from '@apps/nine-lives/types';

import { DEFAULT_EXPENSE_CATEGORIES, getExpenseCategoryLabel } from '../utils/budgetCalculators';

interface ExpenseFormValues {
  category: string;
  amount: string;
  isRecurring: boolean;
  recurrenceInterval?: string;
  incurredAt: string;
  notes?: string | null;
}

interface ExpenseFormModalProps {
  isOpen: boolean;
  initialExpense?: Partial<Expense> | null;
  isSubmitting?: boolean;
  onSubmit: (
    expense: Partial<Expense> & Pick<Expense, 'category' | 'amount' | 'isRecurring' | 'incurredAt'>,
  ) => Promise<void> | void;
  onDelete?: (expenseId: string) => Promise<void> | void;
  onClose?: () => void;
}

const { checkbox, input, select, textarea } = FormFactories;

function ExpenseFormModal({
  isOpen,
  initialExpense,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: ExpenseFormModalProps) {
  const { confirm } = useActionModal();
  const formId = initialExpense?.id ?? 'new-nine-lives-expense';
  const isEditing = Boolean(initialExpense?.id);

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
      select({
        name: 'category',
        label: 'Category',
        options: categoryOptions,
        required: true,
      }),
      input({
        name: 'amount',
        label: 'Amount',
        type: 'number',
        step: '0.01',
        placeholder: '72.00',
        required: true,
        variant: 'outline',
      }),
      checkbox({
        name: 'isRecurring',
        label: 'Recurring expense',
        text: 'Count this again each month or year.',
      }),
      select({
        name: 'recurrenceInterval',
        label: 'Billing cadence',
        options: recurrenceOptions,
      }),
      createDateInputField({
        name: 'incurredAt',
        label: 'Date incurred',
        required: true,
        variant: 'outline',
      }),
      textarea({
        name: 'notes',
        label: 'Notes (optional)',
        placeholder: 'Vet visit, food refill, or other context',
        rows: 3,
        variant: 'outline',
      }),
    ],
    [categoryOptions, recurrenceOptions],
  );

  const initialData = useMemo(
    () => ({
      category: initialExpense?.category ?? DEFAULT_EXPENSE_CATEGORIES[0],
      amount: initialExpense?.amount ? String(initialExpense.amount) : '',
      isRecurring: Boolean(initialExpense?.isRecurring),
      recurrenceInterval: initialExpense?.recurrenceInterval ?? 'monthly',
      incurredAt: toDateInputValue(initialExpense?.incurredAt ?? undefined),
      notes: initialExpense?.notes ?? '',
    }),
    [initialExpense],
  );

  const handleSubmit = async (data: ExpenseFormValues) => {
    const amount = Number(data.amount);
    const incurredAt = fromDateInputValue(data.incurredAt);

    if (!data.category || !Number.isFinite(amount) || amount <= 0 || incurredAt === null) {
      return;
    }

    await onSubmit({
      id: initialExpense?.id,
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
              <Button type='submit' loading={isSubmitting}>
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
