import type { TripExpense } from '@apps/waypoint/types';
import { getResolvedExpenseAmount } from '@apps/waypoint/utils/splitCalculators';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** An expense's amount as its list shows it: the paid bill over an estimate, and "per person" where it is one. */
export function formatExpenseAmount(expense: TripExpense) {
  const formatter =
    currencyFormatters.get(expense.currency) ??
    new Intl.NumberFormat(undefined, { style: 'currency', currency: expense.currency });
  currencyFormatters.set(expense.currency, formatter);
  const resolved = getResolvedExpenseAmount(expense);
  const amount =
    resolved !== null
      ? formatter.format(resolved)
      : `${formatter.format(expense.amountMin ?? 0)}–${formatter.format(expense.amountMax ?? 0)}`;
  return expense.isPerPerson ? `${amount} per person` : amount;
}
