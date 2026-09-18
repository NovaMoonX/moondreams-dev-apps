import type { IngestionExpenseProposal } from '../lib/extractProposalFromFile.types';
import type { Expense } from '../types';
import { isSameCalendarDay } from '@/utils/dateInputUtils';

function sameCatIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((catId) => right.includes(catId));
}

/** Sorted-multiset comparison: same count of items, same amounts, regardless of order. */
function sameAmounts(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((amount, index) => Math.abs(amount - sortedRight[index]) < 0.01);
}

/**
 * A re-parse of the same invoice can word a line item's category/label slightly differently
 * even when it's the exact same charge, so those are ignored here — the numbers (the per-item
 * amounts and the total) are what actually carry the signal, along with the cats and day.
 */
export function detectDuplicateExpense(
  proposal: IngestionExpenseProposal,
  catIds: string[],
  expenses: Expense[],
): boolean {
  const amount = proposal.items.reduce((total, item) => total + item.amount, 0);
  const proposalAmounts = proposal.items.map((item) => item.amount);

  return expenses.some(
    (expense) =>
      sameCatIds(catIds, expense.catIds) &&
      isSameCalendarDay(expense.incurredAt, proposal.incurredAt) &&
      Math.abs(expense.amount - amount) < 0.01 &&
      sameAmounts(
        expense.items.map((item) => item.amount),
        proposalAmounts,
      ),
  );
}
