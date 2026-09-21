import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

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
  const [dayFilter, setDayFilter] = useState('all');
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
    if (dayFilter === 'all') return true;
    if (dayFilter === 'other') return expense.dayIndex === null;
    return expense.dayIndex === Number(dayFilter);
  });
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
      <div className='flex flex-wrap gap-2'>
        <Button variant={dayFilter === 'all' ? 'primary' : 'secondary'} size='sm' onClick={() => setDayFilter('all')}>
          All
        </Button>
        {Array.from({ length: dayCount }, (_, index) => (
          <Button key={index} variant={dayFilter === String(index) ? 'primary' : 'secondary'} size='sm' onClick={() => setDayFilter(String(index))}>
            Day {index + 1}
          </Button>
        ))}
        <Button variant={dayFilter === 'other' ? 'primary' : 'secondary'} size='sm' onClick={() => setDayFilter('other')}>
          Other
        </Button>
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
