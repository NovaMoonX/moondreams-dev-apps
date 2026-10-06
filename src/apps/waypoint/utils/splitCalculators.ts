import type { EarlyPayment, TripExpense } from '@apps/waypoint/types';

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

export const getEarlyPayments = (expense: Pick<TripExpense, 'earlyPayments'>): Record<string, EarlyPayment> =>
  expense.earlyPayments ?? {};

export interface MoneyRange {
  min: number;
  max: number;
}

type ShareExpense = Pick<
  TripExpense,
  | 'amount'
  | 'amountMin'
  | 'amountMax'
  | 'paidAmount'
  | 'status'
  | 'isPerPerson'
  | 'targetType'
  | 'targetMemberIds'
  | 'payerUid'
  | 'splitAmounts'
>;

/** What `uid` owes toward an expense (a range while it is an estimate); `null` outside the split or with no amount yet. */
export function getMemberShareRange(
  expense: ShareExpense,
  currentMemberIds: string[],
  uid: string,
): MoneyRange | null {
  const splitMemberIds = getSplitMemberIds(expense, currentMemberIds);
  if (!splitMemberIds.includes(uid)) {
    return null;
  }

  const multiplier = getPerPersonMultiplier(expense, splitMemberIds);
  const getShare = (total: number) => computeEvenSplit(splitMemberIds, scaleAmount(total, multiplier))[uid] ?? 0;
  const known = getResolvedExpenseAmount(expense);
  if (known !== null) {
    const total = scaleAmount(known, multiplier);
    const custom = getActiveSplitAmounts(expense, currentMemberIds);
    const share = custom ? (custom[uid] ?? 0) : (computeEvenSplit(splitMemberIds, total)[uid] ?? 0);
    return { min: share, max: share };
  }
  if (expense.amountMin === null || expense.amountMax === null) {
    return null;
  }
  return { min: getShare(expense.amountMin), max: getShare(expense.amountMax) };
}


export interface MemberTotals {
  paidByMe: MoneyRange;
  expectedForMe: MoneyRange;
  myTotal: MoneyRange;
  sentEarly: number;
}

export function computeMemberTotals(expenses: TripExpense[], currentMemberIds: string[], uid: string): MemberTotals {
  const add = (range: MoneyRange, value: MoneyRange | null): MoneyRange =>
    value ? { min: range.min + value.min, max: range.max + value.max } : range;
  const empty: MoneyRange = { min: 0, max: 0 };
  return expenses.reduce<MemberTotals>(
    (totals, expense) => {
      const share = getMemberShareRange(expense, currentMemberIds, uid);
      const fronted = expense.status === 'PAID' && expense.payerUid === uid ? getExpenseTotalAmount(expense, currentMemberIds) : null;
      return {
        paidByMe: add(totals.paidByMe, fronted === null ? null : { min: fronted, max: fronted }),
        expectedForMe: expense.status === 'EXPECTED' ? add(totals.expectedForMe, share) : totals.expectedForMe,
        myTotal: add(totals.myTotal, share),
        sentEarly: totals.sentEarly + (getEarlyPayments(expense)[uid]?.isReturned === false ? getEarlyPayments(expense)[uid].amount : 0),
      };
    },
    { paidByMe: empty, expectedForMe: empty, myTotal: empty, sentEarly: 0 },
  );
}

export function getEarlyPaymentLimit(
  expense: TripExpense,
  currentMemberIds: string[],
  uid: string,
): { canPayEarly: false; reason: string } | { canPayEarly: true; share: MoneyRange } {
  if (expense.status !== 'EXPECTED') {
    return { canPayEarly: false, reason: 'This expense is already paid.' };
  }
  const share = getMemberShareRange(expense, currentMemberIds, uid);
  if (share === null) {
    return { canPayEarly: false, reason: "You aren't part of this expense." };
  }
  if (!currentMemberIds.some((memberUid) => memberUid !== uid)) {
    return { canPayEarly: false, reason: 'There is nobody else on the trip to pay yet.' };
  }
  return { canPayEarly: true, share };
}

export interface OwedItem {
  expense: TripExpense;
  share: number;
  isRepaid: boolean;
  /** The part of the share already covered by an early payment to the person owed. */
  applied: number;
}

export interface DirectionalOwed {
  items: OwedItem[];
  total: number;
  repaid: number;
  remaining: number;
  remainingExpenses: TripExpense[];
  repaidExpenses: TripExpense[];
}

export interface EarlyItem {
  expense: TripExpense;
  payment: EarlyPayment;
  state: 'PENDING' | 'APPLIED' | 'HELD' | 'RETURNED';
  /** How much of it covers the sender's own share once the recipient has paid the expense. */
  applied: number;
}

export interface PairSettlement {
  personA: string;
  personB: string;
  /** Money personA sent personB ahead of an expense, and the other way around. */
  aPaidEarly: EarlyItem[];
  bPaidEarly: EarlyItem[];
  /** Positive: personA owes personB net. Negative: personB owes personA net. ~0: settled net. */
  netAmount: number;
  aOwesB: DirectionalOwed;
  bOwesA: DirectionalOwed;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

const emptyOwed = (): DirectionalOwed => ({
  items: [],
  total: 0,
  repaid: 0,
  remaining: 0,
  remainingExpenses: [],
  repaidExpenses: [],
});

const directionKey = (debtorUid: string, creditorUid: string) => `${debtorUid}>${creditorUid}`;

// Every expense a creditor paid where a debtor owes a share, split into what's already been marked
// repaid and what's still outstanding. This is the raw, un-netted relationship between exactly two
// people, so a circular pair (A owes B on one expense, B owes A on another) shows both sides. Each
// expense is split once for all of its debtors, not once per pair, so a big group stays quick.
function groupOwedByDirection(expenses: TripExpense[], currentMemberIds: string[]): Map<string, DirectionalOwed> {
  const byDirection = new Map<string, DirectionalOwed>();
  expenses.forEach((expense) => {
    const creditorUid = expense.payerUid;
    const total = getExpenseTotalAmount(expense, currentMemberIds);
    if (expense.status !== 'PAID' || creditorUid === null || total === null) {
      return;
    }

    const splitMemberIds = getSplitMemberIds(expense, currentMemberIds);
    const amounts = getActiveSplitAmounts(expense, currentMemberIds) ?? computeEvenSplit(splitMemberIds, total);
    splitMemberIds.forEach((debtorUid) => {
      if (debtorUid === creditorUid) {
        return;
      }

      const share = amounts[debtorUid] ?? 0;
      const isRepaid = (expense.paidMemberStatus ?? {})[debtorUid]?.isPaid ?? false;
      const early = getEarlyPayments(expense)[debtorUid];
      const applied = early && early.toUid === creditorUid && !early.isReturned ? Math.min(early.amount, share) : 0;
      const covered = isRepaid ? share : applied;
      const isSettled = share - covered <= EPSILON;
      const key = directionKey(debtorUid, creditorUid);
      const owed = byDirection.get(key) ?? emptyOwed();
      owed.items.push({ expense, share, isRepaid, applied });
      owed.total += share;
      owed.repaid += covered;
      owed.remaining += share - covered;
      (isSettled ? owed.repaidExpenses : owed.remainingExpenses).push(expense);
      byDirection.set(key, owed);
    });
  });
  return byDirection;
}

function groupEarlyItems(expenses: TripExpense[], currentMemberIds: string[]): Map<string, EarlyItem[]> {
  const toEarlyItem = (expense: TripExpense, fromUid: string, payment: EarlyPayment): EarlyItem => {
    if (payment.isReturned) {
      return { expense, payment, state: 'RETURNED', applied: 0 };
    }
    if (expense.status === 'EXPECTED') {
      return { expense, payment, state: 'PENDING', applied: 0 };
    }
    const share =
      expense.payerUid === payment.toUid ? (getMemberShareRange(expense, currentMemberIds, fromUid)?.max ?? 0) : 0;
    const applied = Math.min(payment.amount, share);
    return { expense, payment, state: applied > 0 ? 'APPLIED' : 'HELD', applied };
  };
  const byDirection = new Map<string, EarlyItem[]>();
  expenses.forEach((expense) => {
    Object.entries(getEarlyPayments(expense)).forEach(([fromUid, payment]) => {
      const item = toEarlyItem(expense, fromUid, payment);
      const key = directionKey(fromUid, payment.toUid);
      byDirection.set(key, [...(byDirection.get(key) ?? []), item]);
    });
  });
  return byDirection;
}

// Money the recipient is still holding for the sender: all of it until the expense is paid by the
// recipient, then only what goes beyond the sender's share of it.
const sumHeld = (items: EarlyItem[]) =>
  items.filter((item) => item.state !== 'RETURNED').reduce((total, item) => total + item.payment.amount - item.applied, 0);

export function computePairSettlements(
  expenses: TripExpense[],
  currentMemberIds: string[],
): PairSettlement[] {
  const pairKeys = new Set<string>();
  expenses.forEach((expense) => {
    Object.entries(getEarlyPayments(expense)).forEach(([fromUid, payment]) => {
      pairKeys.add(pairKey(fromUid, payment.toUid));
    });
    if (expense.status !== 'PAID' || expense.payerUid === null) {
      return;
    }
    getSplitMemberIds(expense, currentMemberIds).forEach((uid) => {
      if (uid !== expense.payerUid) {
        pairKeys.add(pairKey(uid, expense.payerUid as string));
      }
    });
  });

  const owedByDirection = groupOwedByDirection(expenses, currentMemberIds);
  const earlyByDirection = groupEarlyItems(expenses, currentMemberIds);
  return Array.from(pairKeys).map((key) => {
    const [personA, personB] = key.split('|');
    const aOwesB = owedByDirection.get(directionKey(personA, personB)) ?? emptyOwed();
    const bOwesA = owedByDirection.get(directionKey(personB, personA)) ?? emptyOwed();
    const aPaidEarly = earlyByDirection.get(directionKey(personA, personB)) ?? [];
    const bPaidEarly = earlyByDirection.get(directionKey(personB, personA)) ?? [];
    return {
      personA,
      personB,
      aPaidEarly,
      bPaidEarly,
      netAmount:
        Math.round(
          (aOwesB.remaining - bOwesA.remaining - sumHeld(aPaidEarly) + sumHeld(bPaidEarly)) * 100,
        ) / 100,
      aOwesB,
      bOwesA,
    };
  });
}

export function isPairSettled(settlement: PairSettlement): boolean {
  return Math.abs(settlement.netAmount) <= EPSILON;
}
