import type { IngestionExpenseProposal } from '../lib/extractProposalFromFile.types';
import type { Expense } from '../types';
import { normalizeString } from '@/utils/stringUtils';

function sameCalendarDay(left: number, right: number): boolean {
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

function sameCatIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((catId) => right.includes(catId));
}

export function detectDuplicateExpense(
  proposal: IngestionExpenseProposal,
  catIds: string[],
  expenses: Expense[],
): boolean {
  const amount = proposal.items.reduce((total, item) => total + item.amount, 0);

  return expenses.some(
    (expense) =>
      sameCatIds(catIds, expense.catIds) &&
      sameCalendarDay(expense.incurredAt, proposal.incurredAt) &&
      Math.abs(expense.amount - amount) < 0.01 &&
      expense.items.length === proposal.items.length &&
      expense.items.every(
        (existingItem, index) =>
          existingItem.category === proposal.items[index].category &&
          normalizeString(existingItem.label ?? '') === normalizeString(proposal.items[index].label ?? '') &&
          Math.abs(existingItem.amount - proposal.items[index].amount) < 0.01,
      ),
  );
}
