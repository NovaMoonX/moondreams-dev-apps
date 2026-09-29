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

export interface DirectionalOwed {
  total: number;
  repaid: number;
  remaining: number;
  remainingExpenses: TripExpense[];
  repaidExpenses: TripExpense[];
}

export interface PairSettlement {
  personA: string;
  personB: string;
  /** Positive: personA owes personB net. Negative: personB owes personA net. ~0: settled net. */
  netAmount: number;
  aOwesB: DirectionalOwed;
  bOwesA: DirectionalOwed;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

// Every expense creditorUid paid where debtorUid owes a share, split into what's already
// been marked repaid and what's still outstanding — this is the raw, un-netted relationship
// between exactly these two people, so a circular pair (A owes B on one expense, B owes A on
// another) shows both sides instead of only the minimized net difference.
function getOwedInDirection(
  debtorUid: string,
  creditorUid: string,
  expenses: TripExpense[],
  currentMemberIds: string[],
): DirectionalOwed {
  return expenses.reduce<DirectionalOwed>(
    (acc, expense) => {
      if (expense.status !== 'PAID' || expense.payerUid !== creditorUid) {
        return acc;
      }

      const splitMemberIds = getSplitMemberIds(expense, currentMemberIds);
      const total = getExpenseTotalAmount(expense, currentMemberIds);
      if (!splitMemberIds.includes(debtorUid) || total === null) {
        return acc;
      }

      const amounts = getActiveSplitAmounts(expense, currentMemberIds) ?? computeEvenSplit(splitMemberIds, total);
      const share = amounts[debtorUid] ?? 0;
      const isRepaid = expense.paidMemberStatus[debtorUid]?.isPaid ?? false;
      return {
        total: acc.total + share,
        repaid: acc.repaid + (isRepaid ? share : 0),
        remaining: acc.remaining + (isRepaid ? 0 : share),
        remainingExpenses: isRepaid ? acc.remainingExpenses : [...acc.remainingExpenses, expense],
        repaidExpenses: isRepaid ? [...acc.repaidExpenses, expense] : acc.repaidExpenses,
      };
    },
    { total: 0, repaid: 0, remaining: 0, remainingExpenses: [], repaidExpenses: [] },
  );
}

export function computePairSettlements(
  expenses: TripExpense[],
  currentMemberIds: string[],
): PairSettlement[] {
  const pairKeys = new Set<string>();
  expenses.forEach((expense) => {
    if (expense.status !== 'PAID' || expense.payerUid === null) {
      return;
    }
    getSplitMemberIds(expense, currentMemberIds).forEach((uid) => {
      if (uid !== expense.payerUid) {
        pairKeys.add(pairKey(uid, expense.payerUid as string));
      }
    });
  });

  return Array.from(pairKeys).map((key) => {
    const [personA, personB] = key.split('|');
    const aOwesB = getOwedInDirection(personA, personB, expenses, currentMemberIds);
    const bOwesA = getOwedInDirection(personB, personA, expenses, currentMemberIds);
    return {
      personA,
      personB,
      netAmount: Math.round((aOwesB.remaining - bOwesA.remaining) * 100) / 100,
      aOwesB,
      bOwesA,
    };
  });
}

export function isPairSettled(settlement: PairSettlement): boolean {
  return Math.abs(settlement.netAmount) <= EPSILON;
}
