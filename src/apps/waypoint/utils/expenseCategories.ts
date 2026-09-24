import { EXPENSE_CATEGORY_LABELS, PRESET_EXPENSE_CATEGORIES } from '@apps/waypoint/constants';
import type { ExpenseCategory, TripExpense } from '@apps/waypoint/types';

const CUSTOM_PREFIX = 'custom:';

// A document from before `category` was a required field (or otherwise malformed)
// reads back with it missing or invalid — fall back to 'OTHER' instead of letting
// that propagate into a key string other code assumes is always one of these.
function normalizeCategory(category: unknown): ExpenseCategory {
  return typeof category === 'string' && category in EXPENSE_CATEGORY_LABELS
    ? (category as ExpenseCategory)
    : 'OTHER';
}

export function getExpenseCategoryKey(
  expense: Pick<TripExpense, 'category' | 'customCategoryLabel'>,
): string {
  const category = normalizeCategory(expense.category);
  return category === 'OTHER' && expense.customCategoryLabel
    ? `${CUSTOM_PREFIX}${expense.customCategoryLabel}`
    : category;
}

export function parseExpenseCategoryKey(key: string): {
  category: ExpenseCategory;
  customCategoryLabel: string | null;
} {
  if (typeof key === 'string' && key.startsWith(CUSTOM_PREFIX)) {
    return { category: 'OTHER', customCategoryLabel: key.slice(CUSTOM_PREFIX.length) };
  }

  return { category: normalizeCategory(key), customCategoryLabel: null };
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
