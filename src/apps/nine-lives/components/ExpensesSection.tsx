import { useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createExpense,
  deleteExpense,
  updateExpense,
} from '../store/actions/expensesActions';
import { selectExpensesByCat } from '../store/selectors';
import type { Expense } from '../types';
import BudgetSummary from './BudgetSummary';
import ExpenseFormModal from './ExpenseFormModal';

interface ExpensesSectionProps {
  householdId: string;
  catId: string;
  catName: string;
}

function ExpensesSection({ householdId, catId, catName }: ExpensesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const expenses = useAppSelector(selectExpensesByCat(catId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const handleCreate = async (
    expense: Partial<Expense> & Pick<Expense, 'category' | 'amount' | 'isRecurring' | 'incurredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createExpense({ householdId, catId, uid: user.uid, expense }),
      ).unwrap();
      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    expense: Partial<Expense> & Pick<Expense, 'category' | 'amount' | 'isRecurring' | 'incurredAt'>,
  ) => {
    if (!editingExpense) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateExpense({
          householdId,
          catId,
          expenseId: editingExpense.id,
          changes: expense,
        }),
      ).unwrap();
      setIsFormOpen(false);
      setEditingExpense(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expenseId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteExpense({ householdId, catId, expenseId })).unwrap();
      setIsFormOpen(false);
      setEditingExpense(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <small className='text-sm text-muted-foreground'>Track {catName}&rsquo;s spending and recurring costs.</small>
      </div>

      <BudgetSummary
        expenses={expenses}
        onAddExpense={() => {
          setEditingExpense(null);
          setIsFormOpen(true);
        }}
        onEditExpense={(expense) => {
          setEditingExpense(expense);
          setIsFormOpen(true);
        }}
      />

      <ExpenseFormModal
        isOpen={isFormOpen}
        initialExpense={editingExpense}
        isSubmitting={isSubmitting}
        onSubmit={editingExpense ? handleUpdate : handleCreate}
        onDelete={editingExpense ? handleDelete : undefined}
        onClose={() => {
          setIsFormOpen(false);
          setEditingExpense(null);
        }}
      />
    </div>
  );
}

export default ExpensesSection;
