import { useMemo, useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';

import {
  createExpense,
  deleteExpense,
  updateExpense,
} from '../store/actions/expensesActions';
import {
  selectCatsByHousehold,
  selectExpensesByHousehold,
  selectIngestionDraftsByHousehold,
} from '../store/selectors';
import type { Expense } from '../types';
import DetailsDisclosure from './DetailsDisclosure';
import ExpenseFormModal from './ExpenseFormModal';
import ExpenseTimeline from './ExpenseTimeline';
import DocumentIngestionModal from './DocumentIngestionModal';

interface ExpensesSectionProps {
  householdId: string;
}

function ExpensesSection({ householdId }: ExpensesSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const cats = useAppSelector(selectCatsByHousehold(householdId), shallowEqual);
  const expenses = useAppSelector(selectExpensesByHousehold(householdId), shallowEqual);
  const pendingDraftCount = useAppSelector(selectIngestionDraftsByHousehold(householdId)).length;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isIngestionOpen, setIsIngestionOpen] = useState(false);

  const catOptions = useMemo(() => cats.map((cat) => ({ label: cat.name, value: cat.id })), [cats]);

  const closeModal = () => {
    setIsFormOpen(false);
    setEditingExpense(null);
  };

  const handleSubmit = async (
    expense: Partial<Expense> & Pick<Expense, 'catIds' | 'items' | 'isRecurring' | 'incurredAt'>,
  ) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingExpense) {
        await dispatch(
          updateExpense({
            householdId,
            expenseId: editingExpense.id,
            changes: expense,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createExpense({ householdId, uid: user.uid, expense }),
        ).unwrap();
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expenseId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteExpense({ householdId, expenseId })).unwrap();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <DetailsDisclosure label='Expenses'>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2 pb-2'>
            <small className='text-muted-foreground text-sm'>
              Track spending and recurring costs across every cat.
            </small>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-1'
                disabled={!user?.uid}
                onClick={() => setIsIngestionOpen(true)}
              >
                Upload
                {pendingDraftCount > 0 && (
                  <Badge variant='primary' size='xs' aspect='square' use='status'>
                    {pendingDraftCount}
                  </Badge>
                )}
              </Button>
              <Button
                type='button'
                size='sm'
                disabled={cats.length === 0}
                onClick={() => {
                  setEditingExpense(null);
                  setIsFormOpen(true);
                }}
              >
                <span className='hidden sm:inline'>Log expense</span>
                <span className='sm:hidden'>Log</span>
              </Button>
            </div>
          </div>

          <ExpenseTimeline
            expenses={expenses}
            cats={cats}
            onEdit={(expense) => {
              setEditingExpense(expense);
              setIsFormOpen(true);
            }}
          />
        </div>
      </DetailsDisclosure>

      <ExpenseFormModal
        key={editingExpense?.id ?? 'new'}
        isOpen={isFormOpen}
        householdId={householdId}
        catOptions={catOptions}
        initialExpense={editingExpense}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingExpense ? handleDelete : undefined}
        onClose={closeModal}
      />
      {user?.uid && (
        <DocumentIngestionModal
          isOpen={isIngestionOpen}
          householdId={householdId}
          uid={user.uid}
          intent='expense'
          onClose={() => setIsIngestionOpen(false)}
        />
      )}
    </section>
  );
}

export default ExpensesSection;
