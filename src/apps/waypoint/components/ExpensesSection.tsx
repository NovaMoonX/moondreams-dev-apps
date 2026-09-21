import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import ExpenseFormModal from '@apps/waypoint/components/ExpenseFormModal';
import {
  createExpense,
  markExpensePaid,
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
    { label: 'Expected', total: totals.expected },
    { label: 'Total', total: totals.total },
  ];

  const handleSubmit = async (values: ExpenseSubmitValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await dispatch(
        createExpense({
          uid: currentUserId,
          tripId: trip.id,
          memberIds: Object.keys(trip.members),
          ...values,
        }),
      ).unwrap();
      setIsModalOpen(false);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to add this expense.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async (expense: TripExpense) => {
    setMarkingPaidId(expense.id);
    setError(null);
    try {
      await dispatch(markExpensePaid(expense)).unwrap();
    } catch (markError) {
      setError(getErrorMessage(markError, 'Unable to mark this expense as paid.'));
    } finally {
      setMarkingPaidId(null);
    }
  };

  return (
    <section className='space-y-5 pt-4'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-xl font-semibold'>Expenses</h2>
        {canAddExpenses && (
          <Button onClick={() => setIsModalOpen(true)}>Add expense</Button>
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
        <div
          role='group'
          aria-label='Filter by day'
          className='flex flex-wrap gap-2'
        >
          {Array.from({ length: dayCount }, (_, index) => {
            const value = String(index);
            const isSelected = dayFilter.includes(value);

            return (
              <button
                key={value}
                type='button'
                aria-pressed={isSelected}
                onClick={() => toggleDayFilter(value)}
              >
                <Badge
                  variant={isSelected ? 'primary' : 'muted'}
                  outline={!isSelected}
                >
                  Day {index + 1}
                </Badge>
              </button>
            );
          })}
          <button
            type='button'
            aria-pressed={dayFilter.includes('other')}
            onClick={() => toggleDayFilter('other')}
          >
            <Badge
              variant={dayFilter.includes('other') ? 'primary' : 'muted'}
              outline={!dayFilter.includes('other')}
            >
              No specific day
            </Badge>
          </button>
        </div>
        <div
          role='group'
          aria-label='Filter by person'
          className='flex flex-wrap items-center gap-2'
        >
          {memberIds.map((uid) => {
            const isSelected = payerFilter.includes(uid);

            return (
              <button
                key={uid}
                type='button'
                aria-pressed={isSelected}
                onClick={() => togglePayerFilter(uid)}
              >
                <Badge
                  variant={isSelected ? 'primary' : 'muted'}
                  outline={!isSelected}
                >
                  {memberLabel(uid)}
                </Badge>
              </button>
            );
          })}
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
              className='flex items-center justify-between gap-3 py-3'
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
                  {formatTotal(
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
                    onClick={() => void handleMarkPaid(expense)}
                  >
                    {markingPaidId === expense.id ? 'Marking…' : 'Mark paid'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ExpenseFormModal
        isOpen={isModalOpen}
        trip={trip}
        defaultPayerUid={currentUserId}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}

export default ExpensesSection;
