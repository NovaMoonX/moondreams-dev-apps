import type { TripExpense } from '@apps/waypoint/types';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatExpenseAmount(expense: TripExpense) {
  const formatter =
    currencyFormatters.get(expense.currency) ??
    new Intl.NumberFormat(undefined, { style: 'currency', currency: expense.currency });
  currencyFormatters.set(expense.currency, formatter);
  return expense.amount !== null
    ? formatter.format(expense.amount)
    : `${formatter.format(expense.amountMin ?? 0)}–${formatter.format(expense.amountMax ?? 0)}`;
}
