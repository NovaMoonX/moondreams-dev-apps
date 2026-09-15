import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { Expense } from '@apps/nine-lives/types';

import {
  calculateLifetimeExpenseTotal,
  calculateMonthlyExpenseTotal,
  getExpenseCategoryLabel,
} from '../utils/budgetCalculators';

interface BudgetSummaryProps {
  expenses: Expense[];
  onAddExpense?: () => void;
  onEditExpense?: (expense: Expense) => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function BudgetSummary({ expenses, onAddExpense, onEditExpense }: BudgetSummaryProps) {
  const monthlyTotal = calculateMonthlyExpenseTotal(expenses);
  const lifetimeTotal = calculateLifetimeExpenseTotal(expenses);
  const recentExpenses = [...expenses]
    .sort((left, right) => right.incurredAt - left.incurredAt)
    .slice(0, 4);

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className={join('rounded-lg border border-border bg-card p-3')}> 
          <p className='text-xs uppercase tracking-wide text-muted-foreground'>Monthly total</p>
          <p className='mt-2 text-2xl font-semibold'>{currencyFormatter.format(monthlyTotal)}</p>
        </div>
        <div className={join('rounded-lg border border-border bg-card p-3')}>
          <p className='text-xs uppercase tracking-wide text-muted-foreground'>Lifetime total</p>
          <p className='mt-2 text-2xl font-semibold'>{currencyFormatter.format(lifetimeTotal)}</p>
        </div>
      </div>

      {onAddExpense && (
        <div className='flex justify-end'>
          <Button type='button' size='sm' onClick={onAddExpense}>
            Add expense
          </Button>
        </div>
      )}

      <div className='space-y-2'>
        <h3 className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>Recent expenses</h3>

        {recentExpenses.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No expenses logged yet.</p>
        ) : (
          recentExpenses.map((expense) => (
            <button
              key={expense.id}
              type='button'
              onClick={() => onEditExpense?.(expense)}
              className={join(
                'flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50',
                onEditExpense ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <div>
                <div className='font-medium'>{getExpenseCategoryLabel(expense.category)}</div>
                <div className='text-xs text-muted-foreground'>
                  {new Date(expense.incurredAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {expense.isRecurring ? ` • ${expense.recurrenceInterval ?? 'monthly'}` : ''}
                </div>
              </div>
              <div className='font-semibold'>
                {currencyFormatter.format(expense.amount)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default BudgetSummary;
