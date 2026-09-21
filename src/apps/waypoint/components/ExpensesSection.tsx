import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseFormModal from '@apps/waypoint/components/ExpenseFormModal';
import MarkExpensePaidModal from '@apps/waypoint/components/MarkExpensePaidModal';
import {
  createExpense,
  deleteExpense,
  markExpensePaid,
  updateExpense,
} from '@apps/waypoint/store/actions/expenseActions';
import {
  computeExpenseTotals,
  selectTripExpenses,
  type TripExpenseTotals,
} from '@apps/waypoint/store/selectors';
import type { TripExpense, TripSpace } from '@apps/waypoint/types';

interface ExpensesSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function formatTotal(min: number, max: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  });
  const minimum = formatter.format(min);
  return min === max ? minimum : `${minimum}–${formatter.format(max)}`;
}

function ExpensesSection({ trip, currentUserId }: ExpensesSectionProps) {
  const dispatch = useAppDispatch();
  const expenses = useAppSelector(selectTripExpenses);
  const [dayFilter, setDayFilter] = useState<string[]>([]);
  const [payerFilter, setPayerFilter] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [payingExpense, setPayingExpense] = useState<TripExpense | null>(null);
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dayCount = Math.floor((trip.endDate - trip.startDate) / 86_400_000) + 1;
  const currency = trip.defaultCurrency ?? 'USD';
  const memberIds = Object.keys(trip.members);
  const memberInfo = useUserInfo(memberIds);
  const canAddExpenses = ['ADMIN', 'EDITOR'].includes(
    trip.members[currentUserId]?.role ?? '',
  );
  const memberLabel = (uid: string) =>
    memberInfo?.map[uid]?.displayName || memberInfo?.map[uid]?.email || uid;
  const filteredExpenses = expenses.filter((expense) => {
    const matchesDay =
      dayFilter.length === 0 ||
      (expense.dayIndex === null
        ? dayFilter.includes('other')
        : dayFilter.includes(String(expense.dayIndex)));
    const matchesPayer =
      payerFilter.length === 0 || payerFilter.includes(expense.payerUid);
    return matchesDay && matchesPayer;
  });
  const hasActiveFilters = dayFilter.length > 0 || payerFilter.length > 0;
  const toggleDayFilter = (value: string) => {
    setDayFilter((current) =>
      current.includes(value)
        ? current.filter((filterValue) => filterValue !== value)
        : [...current, value],
    );
  };
  const togglePayerFilter = (value: string) => {
    setPayerFilter((current) =>
      current.includes(value)
        ? current.filter((filterValue) => filterValue !== value)
        : [...current, value],
    );
  };
  const clearFilters = () => {
    setDayFilter([]);
    setPayerFilter([]);
  };
  const totals = computeExpenseTotals(filteredExpenses);
  const totalCards: { label: string; total: TripExpenseTotals['total'] }[] = [
    { label: 'Paid so far', total: totals.paid },
    { label: 'Expected (not yet paid)', total: totals.expected },
    { label: 'Total', total: totals.total },
  ];

  const handleSubmit = async (values: ExpenseSubmitValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingExpense) {
        await dispatch(
          updateExpense({
            expense: editingExpense,
            title: values.title,
            amount: values.amount,
            amountMin: values.amountMin,
            amountMax: values.amountMax,
            payerUid: values.payerUid,
            dayIndex: values.dayIndex,
            paidAmount: values.paidAmount,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createExpense({
            uid: currentUserId,
            tripId: trip.id,
            memberIds: Object.keys(trip.members),
            ...values,
          }),
        ).unwrap();
      }
      setEditingExpense(null);
      setIsModalOpen(false);
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          editingExpense
            ? 'Unable to update this expense.'
            : 'Unable to add this expense.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expense: TripExpense) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dispatch(deleteExpense(expense)).unwrap();
      setEditingExpense(null);
      setIsModalOpen(false);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this expense.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async (expense: TripExpense, paidAmount: number | null) => {
    setMarkingPaidId(expense.id);
    setError(null);
    try {
      await dispatch(markExpensePaid({ expense, paidAmount })).unwrap();
      setPayingExpense(null);
    } catch (markError) {
      setError(getErrorMessage(markError, 'Unable to mark this expense as paid.'));
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleMarkPaidClick = (expense: TripExpense) => {
    if (expense.amount === null) {
      setPayingExpense(expense);
      return;
    }

    void handleMarkPaid(expense, null);
  };

  return (
    <section className='space-y-5 pt-4'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-xl font-semibold'>Expenses</h2>
        {canAddExpenses && (
          <Button
            onClick={() => {
              setEditingExpense(null);
              setIsModalOpen(true);
            }}
          >
            Add expense
          </Button>
        )}
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        {totalCards.map(({ label, total }) => (
          <div key={label} className='border-border rounded-lg border p-3'>
            <p className='text-muted-foreground text-sm'>{label}</p>
            <p className='mt-1 text-lg font-semibold'>
              {formatTotal(total.min, total.max, currency)}
            </p>
          </div>
        ))}
      </div>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-sm font-medium'>
            Filter by
          </span>
          {hasActiveFilters && (
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={clearFilters}
              aria-label='Clear filters'
              className='bg-transparent'
            >
              Clear
            </Button>
          )}
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Days
          </span>
          <div
            role='group'
            aria-label='Filter by day'
            className='flex flex-wrap gap-2'
          >
            {Array.from({ length: dayCount }, (_, index) => {
              const value = String(index);
              const isSelected = dayFilter.includes(value);

              return (
                <Button
                  key={value}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => toggleDayFilter(value)}
                >
                  <Badge
                    variant={isSelected ? 'primary' : 'muted'}
                    outline={!isSelected}
                  >
                    Day {index + 1}
                  </Badge>
                </Button>
              );
            })}
            <Button
              type='button'
              variant='base'
              size='sm'
              aria-pressed={dayFilter.includes('other')}
              onClick={() => toggleDayFilter('other')}
            >
              <Badge
                variant={dayFilter.includes('other') ? 'primary' : 'muted'}
                outline={!dayFilter.includes('other')}
              >
                No specific day
              </Badge>
            </Button>
          </div>
        </div>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2'>
          <span className='text-muted-foreground text-sm sm:w-16 sm:shrink-0'>
            Member
          </span>
          <div
            role='group'
            aria-label='Filter by person'
            className='flex flex-wrap items-center gap-2'
          >
            {memberIds.map((uid) => {
              const isSelected = payerFilter.includes(uid);

              return (
                <Button
                  key={uid}
                  type='button'
                  variant='base'
                  size='sm'
                  aria-pressed={isSelected}
                  onClick={() => togglePayerFilter(uid)}
                >
                  <Badge
                    variant={isSelected ? 'primary' : 'muted'}
                    outline={!isSelected}
                  >
                    {memberLabel(uid)}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
      {filteredExpenses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No expenses for this selection.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {filteredExpenses.map((expense) => (
            <li
              key={expense.id}
              className='flex flex-wrap items-center justify-between gap-3 py-3'
            >
              <div>
                <p className='font-medium'>{expense.title}</p>
                <p className='text-muted-foreground text-sm'>
                  {expense.status === 'PAID' ? 'Paid' : 'Expected'} ·{' '}
                  {memberLabel(expense.payerUid)}
                </p>
              </div>
              <div className='flex items-center gap-3'>
                <span className='font-medium'>
                  {expense.status === 'PAID' && expense.paidAmount !== null
                    ? formatTotal(expense.paidAmount, expense.paidAmount, expense.currency)
                    : formatTotal(
                        expense.amount ?? expense.amountMin ?? 0,
                        expense.amount ?? expense.amountMax ?? expense.amountMin ?? 0,
                        expense.currency,
                      )}
                </span>
                {canAddExpenses && expense.status === 'EXPECTED' && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    disabled={markingPaidId === expense.id}
                    onClick={() => handleMarkPaidClick(expense)}
                  >
                    {markingPaidId === expense.id ? 'Marking…' : 'Mark paid'}
                  </Button>
                )}
                {canAddExpenses && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() => {
                      setEditingExpense(expense);
                      setIsModalOpen(true);
                    }}
                  >
                    Modify
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ExpenseFormModal
        key={editingExpense?.id ?? 'new'}
        isOpen={isModalOpen}
        trip={trip}
        defaultPayerUid={currentUserId}
        initialExpense={editingExpense ?? undefined}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingExpense ? () => handleDelete(editingExpense) : undefined}
        onClose={() => {
          setEditingExpense(null);
          setIsModalOpen(false);
        }}
      />
      <MarkExpensePaidModal
        isOpen={payingExpense !== null}
        expense={payingExpense}
        isSubmitting={payingExpense !== null && markingPaidId === payingExpense.id}
        onSubmit={(paidAmount) => {
          if (payingExpense) {
            void handleMarkPaid(payingExpense, paidAmount);
          }
        }}
        onClose={() => setPayingExpense(null)}
      />
    </section>
  );
}

export default ExpensesSection;
