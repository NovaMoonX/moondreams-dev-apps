import type { Expense, ExpenseCategory, ExpenseLineItem } from '@apps/nine-lives/types';

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

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  adoption_fee: 'Adoption',
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

/** `category` may be a preset `ExpenseCategory` or a household's custom category label — customs are returned as-is. */
export function getExpenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category;
}

export function calculateExpenseItemsTotal(items: Pick<ExpenseLineItem, 'amount'>[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

/** The distinct categories across an expense's line items, in the order they first appear. */
export function getExpenseCategories(expense: Pick<Expense, 'items'>): string[] {
  return Array.from(new Set(expense.items.map((item) => item.category)));
}

export function getRecurringCycleCount(
  expense: Pick<Expense, 'isRecurring' | 'incurredAt' | 'recurrenceInterval' | 'recurrenceEndedAt'>,
  now: number = Date.now(),
): number {
  const effectiveEnd = expense.recurrenceEndedAt != null ? Math.min(expense.recurrenceEndedAt, now) : now;

  if (!expense.isRecurring || expense.incurredAt > effectiveEnd) {
    return 0;
  }

  const start = new Date(expense.incurredAt);
  const end = new Date(effectiveEnd);

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

/** Sums currently-active recurring expenses as their monthly-equivalent cost (a yearly charge is divided by 12). */
export function calculateRecurringMonthlyTotal(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => {
    if (!expense.isRecurring || expense.recurrenceEndedAt != null) {
      return total;
    }

    return total + (expense.recurrenceInterval === 'yearly' ? expense.amount / 12 : expense.amount);
  }, 0);
}

/** Sums currently-active recurring expenses as their yearly-equivalent cost (a monthly charge is multiplied by 12). */
export function calculateRecurringYearlyTotal(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => {
    if (!expense.isRecurring || expense.recurrenceEndedAt != null) {
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
