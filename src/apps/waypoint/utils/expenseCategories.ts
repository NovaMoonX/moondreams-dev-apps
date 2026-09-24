import { EXPENSE_CATEGORY_LABELS, PRESET_EXPENSE_CATEGORIES } from '@apps/waypoint/constants';
import type { ExpenseCategory, TripExpense } from '@apps/waypoint/types';

const CUSTOM_PREFIX = 'custom:';

export function getExpenseCategoryKey(
  expense: Pick<TripExpense, 'category' | 'customCategoryLabel'>,
): string {
  return expense.category === 'OTHER' && expense.customCategoryLabel
    ? `${CUSTOM_PREFIX}${expense.customCategoryLabel}`
    : expense.category;
}

export function parseExpenseCategoryKey(key: string): {
  category: ExpenseCategory;
  customCategoryLabel: string | null;
} {
  if (key.startsWith(CUSTOM_PREFIX)) {
    return { category: 'OTHER', customCategoryLabel: key.slice(CUSTOM_PREFIX.length) };
  }

  const category = key as ExpenseCategory;
  return { category, customCategoryLabel: null };
}

export function getExpenseCategoryKeyLabel(key: string): string {
  const { category, customCategoryLabel } = parseExpenseCategoryKey(key);
  return customCategoryLabel ?? EXPENSE_CATEGORY_LABELS[category];
}

export function getExpenseCategoryKeys(expenses: TripExpense[]): string[] {
  const usedKeys = expenses.map(getExpenseCategoryKey);
  const customKeys = Array.from(
    new Set(usedKeys.filter((key) => !(PRESET_EXPENSE_CATEGORIES as readonly string[]).includes(key))),
  ).sort((a, b) => getExpenseCategoryKeyLabel(a).localeCompare(getExpenseCategoryKeyLabel(b)));

  return [...PRESET_EXPENSE_CATEGORIES, ...customKeys];
}

export function toCustomCategoryKey(label: string): string {
  return `${CUSTOM_PREFIX}${label}`;
}
