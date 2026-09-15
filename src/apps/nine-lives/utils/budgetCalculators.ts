import type { Expense, ExpenseCategory } from '@apps/nine-lives/types';

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'adoption_fee',
  'insurance',
  'food',
  'litter',
  'vet',
  'grooming',
  'supplies',
  'medication',
  'microchipping',
  'spay_neuter',
  'other',
];

export function getExpenseCategoryLabel(category: ExpenseCategory): string {
  const labels: Record<ExpenseCategory, string> = {
    adoption_fee: 'Adoption fee',
    insurance: 'Insurance',
    food: 'Food',
    litter: 'Litter',
    vet: 'Vet',
    grooming: 'Grooming',
    supplies: 'Supplies',
    medication: 'Medication',
    microchipping: 'Microchipping',
    spay_neuter: 'Spay / neuter',
    other: 'Other',
  };

  return labels[category] ?? 'Other';
}

export function getRecurringCycleCount(expense: Expense, now: number = Date.now()): number {
  if (!expense.isRecurring || expense.incurredAt > now) {
    return 0;
  }

  const start = new Date(expense.incurredAt);
  const end = new Date(now);

  if (expense.recurrenceInterval === 'yearly') {
    const yearDelta = end.getFullYear() - start.getFullYear();
    const currentYearCycle =
      end.getMonth() > start.getMonth() ||
      (end.getMonth() === start.getMonth() && end.getDate() >= start.getDate());

    return Math.max(1, yearDelta + (currentYearCycle ? 1 : 0));
  }

  const monthDelta =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const currentMonthCycle = end.getDate() >= start.getDate();

  return Math.max(1, monthDelta + (currentMonthCycle ? 1 : 0));
}

/** Sums recurring expenses as their monthly-equivalent cost (a yearly charge is divided by 12). */
export function calculateRecurringMonthlyTotal(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => {
    if (!expense.isRecurring) {
      return total;
    }

    return total + (expense.recurrenceInterval === 'yearly' ? expense.amount / 12 : expense.amount);
  }, 0);
}

/** Sums recurring expenses as their yearly-equivalent cost (a monthly charge is multiplied by 12). */
export function calculateRecurringYearlyTotal(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => {
    if (!expense.isRecurring) {
      return total;
    }

    return total + (expense.recurrenceInterval === 'yearly' ? expense.amount : expense.amount * 12);
  }, 0);
}

export function calculateLifetimeExpenseTotal(expenses: Expense[], now: number = Date.now()): number {
  return expenses.reduce((total, expense) => {
    if (expense.isRecurring) {
      return total + expense.amount * getRecurringCycleCount(expense, now);
    }

    return total + expense.amount;
  }, 0);
}
