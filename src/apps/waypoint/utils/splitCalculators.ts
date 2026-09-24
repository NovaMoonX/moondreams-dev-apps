import type { TripExpense } from '@apps/waypoint/types';

const EPSILON = 0.005;

export function getResolvedExpenseAmount(
  expense: Pick<TripExpense, 'amount' | 'paidAmount' | 'status'>,
): number | null {
  if (expense.amount !== null) {
    return expense.amount;
  }

  return expense.status === 'PAID' ? expense.paidAmount : null;
}

export function getSplitMemberIds(
  expense: Pick<TripExpense, 'targetType' | 'targetMemberIds' | 'payerUid'>,
  currentMemberIds: string[],
): string[] {
  switch (expense.targetType) {
    case 'JUST_ME':
      return expense.payerUid === null ? [] : [expense.payerUid];
    case 'EVERYONE_CURRENT':
    case 'EVERYONE_INCLUDING_FUTURE':
      return currentMemberIds;
    case 'SPECIFIC_MEMBERS':
    default:
      return expense.targetMemberIds;
  }
}

export function getActiveSplitAmounts(
  expense: Pick<TripExpense, 'splitAmounts' | 'targetType' | 'targetMemberIds' | 'payerUid'>,
  currentMemberIds: string[],
): Record<string, number> | null {
  const { splitAmounts } = expense;
  if (splitAmounts === null) {
    return null;
  }

  const coversSplit = getSplitMemberIds(expense, currentMemberIds).every(
    (uid) => uid in splitAmounts,
  );
  return coversSplit ? splitAmounts : null;
}

export function getPerPersonMultiplier(
  expense: Pick<TripExpense, 'isPerPerson'>,
  splitMemberIds: string[],
): number {
  return expense.isPerPerson ? Math.max(1, splitMemberIds.length) : 1;
}

export function scaleAmount(amount: number, multiplier: number): number {
  const scaled = Math.round(amount * multiplier * 100) / 100;
  return scaled;
}

export function getExpenseTotalAmount(
  expense: Pick<
    TripExpense,
    'amount' | 'paidAmount' | 'status' | 'isPerPerson' | 'targetType' | 'targetMemberIds' | 'payerUid'
  >,
  currentMemberIds: string[],
): number | null {
  const amount = getResolvedExpenseAmount(expense);
  if (amount === null) {
    return null;
  }

  const total = scaleAmount(
    amount,
    getPerPersonMultiplier(expense, getSplitMemberIds(expense, currentMemberIds)),
  );
  return total;
}

export function computeEvenSplit(
  memberIds: string[],
  amount: number,
): Record<string, number> {
  if (memberIds.length === 0) {
    return {};
  }

  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / memberIds.length);
  const remainder = cents - base * memberIds.length;

  return Object.fromEntries(
    memberIds.map((uid, index) => [
      uid,
      (base + (index < remainder ? 1 : 0)) / 100,
    ]),
  );
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

export interface DuesSummary {
  balances: Record<string, number>;
  debts: SimplifiedDebt[];
}

interface ExpenseShares {
  payerUid: string;
  total: number;
  shares: Record<string, number>;
  memberIds: string[];
}

function getExpenseShares(
  expense: TripExpense,
  currentMemberIds: string[],
): ExpenseShares | null {
  // A null payer means everyone paid their own share directly — nothing to settle.
  if (expense.status !== 'PAID' || expense.payerUid === null) {
    return null;
  }

  const total = getExpenseTotalAmount(expense, currentMemberIds);
  const memberIds = getSplitMemberIds(expense, currentMemberIds);
  if (total === null || memberIds.length === 0) {
    return null;
  }

  const shares =
    getActiveSplitAmounts(expense, currentMemberIds) ?? computeEvenSplit(memberIds, total);
  const result = { payerUid: expense.payerUid, total, shares, memberIds };
  return result;
}

export function computeDuesSummary(
  expenses: TripExpense[],
  currentMemberIds: string[],
): DuesSummary {
  const balances = expenses
    .map((expense) => getExpenseShares(expense, currentMemberIds))
    .filter((entry): entry is ExpenseShares => entry !== null)
    .reduce<Record<string, number>>((acc, { payerUid, total, shares, memberIds }) => {
      const withPayer = { ...acc, [payerUid]: (acc[payerUid] ?? 0) + total };
      return memberIds.reduce(
        (next, uid) => ({ ...next, [uid]: (next[uid] ?? 0) - (shares[uid] ?? 0) }),
        withPayer,
      );
    }, {});

  return { balances, debts: simplifyDebts(balances) };
}

export function getDebtExpenses(
  debt: Pick<SimplifiedDebt, 'from' | 'to'>,
  expenses: TripExpense[],
  currentMemberIds: string[],
): TripExpense[] {
  const debtExpenses = expenses.filter((expense) => {
    const entry = getExpenseShares(expense, currentMemberIds);
    if (!entry) {
      return false;
    }

    const owes = (payer: string, other: string) =>
      entry.payerUid === payer && (entry.shares[other] ?? 0) > EPSILON;
    return owes(debt.to, debt.from) || owes(debt.from, debt.to);
  });
  return debtExpenses;
}

function simplifyDebts(balances: Record<string, number>): SimplifiedDebt[] {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > EPSILON)
    .map(([uid, amount]) => ({ uid, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < -EPSILON)
    .map(([uid, amount]) => ({ uid, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > EPSILON) {
      debts.push({
        from: debtor.uid,
        to: creditor.uid,
        amount: Math.round(amount * 100) / 100,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount <= EPSILON) {
      i++;
    }
    if (creditor.amount <= EPSILON) {
      j++;
    }
  }

  return debts;
}
