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

/** What `uid` owes toward an expense, as a range when the amount is still an estimate; `null` when
 * they aren't part of the split or there is no amount to share yet. */
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

/** What one member's own numbers look like: money they fronted, and their share of what is still
 * expected and of everything. Ranges stay ranges. */
export interface MemberTotals {
  paidByMe: MoneyRange;
  expectedForMe: MoneyRange;
  myTotal: MoneyRange;
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
      };
    },
    { paidByMe: empty, expectedForMe: empty, myTotal: empty },
  );
}

/** Whether `uid` could still pay early toward this expense, and the most they may send. */
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
  return { canPayEarly: true, share };
}

export interface OwedItem {
  expense: TripExpense;
  share: number;
  isRepaid: boolean;
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
  /** `PENDING` until the expense is paid, then `APPLIED` when the recipient is the one who paid it,
   * `HELD` when somebody else did (the recipient still has the money), or `RETURNED`. */
  state: 'PENDING' | 'APPLIED' | 'HELD' | 'RETURNED';
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
      const isRepaid = (expense.paidMemberStatus ?? {})[debtorUid]?.isPaid ?? false;
      return {
        items: [...acc.items, { expense, share, isRepaid }],
        total: acc.total + share,
        repaid: acc.repaid + (isRepaid ? share : 0),
        remaining: acc.remaining + (isRepaid ? 0 : share),
        remainingExpenses: isRepaid ? acc.remainingExpenses : [...acc.remainingExpenses, expense],
        repaidExpenses: isRepaid ? [...acc.repaidExpenses, expense] : acc.repaidExpenses,
      };
    },
    { items: [], total: 0, repaid: 0, remaining: 0, remainingExpenses: [], repaidExpenses: [] },
  );
}

function getEarlyState(expense: TripExpense, payment: EarlyPayment): EarlyItem['state'] {
  if (payment.isReturned) {
    return 'RETURNED';
  }
  if (expense.status === 'EXPECTED') {
    return 'PENDING';
  }
  return expense.payerUid === payment.toUid ? 'APPLIED' : 'HELD';
}

// Money sent early is money the recipient is holding for the sender, until it is sent back: it
// lowers what the sender owes the recipient, and when the expense is paid by the recipient it
// cancels the sender's share of it. A returned one no longer counts.
function getEarlyItems(expenses: TripExpense[], fromUid: string, toUid: string): EarlyItem[] {
  return expenses.flatMap((expense) => {
    const payment = getEarlyPayments(expense)[fromUid];
    return payment && payment.toUid === toUid ? [{ expense, payment, state: getEarlyState(expense, payment) }] : [];
  });
}

const sumHeld = (items: EarlyItem[]) =>
  items.filter((item) => item.state !== 'RETURNED').reduce((total, item) => total + item.payment.amount, 0);

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

  return Array.from(pairKeys).map((key) => {
    const [personA, personB] = key.split('|');
    const aOwesB = getOwedInDirection(personA, personB, expenses, currentMemberIds);
    const bOwesA = getOwedInDirection(personB, personA, expenses, currentMemberIds);
    const aPaidEarly = getEarlyItems(expenses, personA, personB);
    const bPaidEarly = getEarlyItems(expenses, personB, personA);
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
