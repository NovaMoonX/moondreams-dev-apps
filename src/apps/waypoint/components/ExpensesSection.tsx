import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from '@moondreamsdev/dreamer-ui/symbols';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { useUserInfo } from '@/hooks/useUserInfo';
import ExpenseFormModal from '@apps/waypoint/components/ExpenseFormModal';
import type { ExpenseSubmitValues } from '@apps/waypoint/components/ExpenseFormModal';
import { createExpense } from '@apps/waypoint/store/actions/expenseActions';
import {
  selectTripExpenseTotals,
  selectTripExpenses,
  type TripExpenseTotals,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

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
  const totals = useAppSelector(selectTripExpenseTotals);
  const [dayFilter, setDayFilter] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayCount = Math.floor((trip.endDate - trip.startDate) / 86_400_000) + 1;
  const currency = trip.defaultCurrency ?? 'USD';
  const payerInfo = useUserInfo(expenses.map((expense) => expense.payerUid));
  const canAddExpenses = ['ADMIN', 'EDITOR'].includes(
    trip.members[currentUserId]?.role ?? '',
  );
  const filteredExpenses = expenses.filter((expense) => {
    if (dayFilter.length === 0) return true;
    return expense.dayIndex === null
      ? dayFilter.includes('other')
      : dayFilter.includes(String(expense.dayIndex));
  });
  const toggleDayFilter = (value: string) => {
    setDayFilter((current) =>
      current.includes(value)
        ? current.filter((filterValue) => filterValue !== value)
        : [...current, value],
    );
  };
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
              {formatTotal(
                total.min,
                total.max,
                currency,
              )}
            </p>
          </div>
        ))}
      </div>
      <div role='group' aria-label='Filter by day' className='flex flex-wrap gap-2'>
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
              <Badge variant={isSelected ? 'primary' : 'muted'} outline={!isSelected}>
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
          <Badge variant={dayFilter.includes('other') ? 'primary' : 'muted'} outline={!dayFilter.includes('other')}>
            No day
          </Badge>
        </button>
        {dayFilter.length > 0 && (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            onClick={() => setDayFilter([])}
            aria-label='Clear day filter'
            className='bg-transparent'
          >
            Clear
          </Button>
        )}
      </div>
      {filteredExpenses.length === 0 ? (
        <p className='text-muted-foreground text-sm'>No expenses for this selection.</p>
      ) : (
        <ul className='divide-border divide-y'>
          {filteredExpenses.map((expense) => (
            <li key={expense.id} className='flex items-center justify-between gap-3 py-3'>
              <div>
                <p className='font-medium'>{expense.title}</p>
                <p className='text-muted-foreground text-sm'>
                  {expense.status === 'PAID' ? 'Paid' : 'Expected'} ·{' '}
                  {payerInfo?.map[expense.payerUid]?.displayName ||
                    payerInfo?.map[expense.payerUid]?.email ||
                    expense.payerUid}
                </p>
              </div>
              <span className='font-medium'>
                {formatTotal(
                  expense.amount ?? expense.amountMin ?? 0,
                  expense.amount ?? expense.amountMax ?? expense.amountMin ?? 0,
                  expense.currency,
                )}
              </span>
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
