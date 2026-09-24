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
    case 'EVERYONE_INCLUDING_FUTURE':
      return currentMemberIds;
    case 'EVERYONE_CURRENT':
    case 'SPECIFIC_MEMBERS':
    default:
      return expense.targetMemberIds;
  }
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

export function computeDuesSummary(
  expenses: TripExpense[],
  currentMemberIds: string[],
): DuesSummary {
  const balances: Record<string, number> = {};
  const addBalance = (uid: string, delta: number) => {
    balances[uid] = (balances[uid] ?? 0) + delta;
  };

  for (const expense of expenses) {
    // A null payer means everyone paid their own share directly — nothing to settle.
    if (expense.status !== 'PAID' || expense.payerUid === null) {
      continue;
    }

    const resolvedAmount = getResolvedExpenseAmount(expense);
    if (resolvedAmount === null) {
      continue;
    }

    const memberIds = getSplitMemberIds(expense, currentMemberIds);
    if (memberIds.length === 0) {
      continue;
    }

    const shares = expense.splitAmounts ?? computeEvenSplit(memberIds, resolvedAmount);
    addBalance(expense.payerUid, resolvedAmount);
    for (const uid of memberIds) {
      addBalance(uid, -(shares[uid] ?? 0));
    }
  }

  return { balances, debts: simplifyDebts(balances) };
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
