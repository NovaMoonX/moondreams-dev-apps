const EPSILON = 0.005;

export interface ExpenseShape {
  status: 'PAID' | 'EXPECTED';
  payerUid: string | null;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  paidAmount: number | null;
  isPerPerson: boolean;
  targetType: string;
  targetMemberIds: string[];
  splitAmounts: Record<string, number> | null;
  repaidUids: string[];
  earlyPayments: Record<
    string,
    { toUid: string; amount: number; isReturned: boolean }
  >;
}

export interface Balance {
  oweCents: number;
  owedCents: number;
}

const scaleAmount = (amount: number, multiplier: number) =>
  Math.round(amount * multiplier * 100) / 100;

const computeEvenSplit = (
  memberIds: string[],
  amount: number,
): Record<string, number> => {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / Math.max(1, memberIds.length));
  const remainder = cents - base * memberIds.length;
  return Object.fromEntries(
    memberIds.map((uid, index) => [
      uid,
      (base + (index < remainder ? 1 : 0)) / 100,
    ]),
  );
};

const getResolvedAmount = (expense: ExpenseShape) =>
  expense.amount ?? (expense.status === 'PAID' ? expense.paidAmount : null);

const getSplitMemberIds = (expense: ExpenseShape, memberIds: string[]) => {
  switch (expense.targetType) {
    case 'JUST_ME':
      return expense.payerUid === null ? [] : [expense.payerUid];
    case 'EVERYONE_CURRENT':
    case 'EVERYONE_INCLUDING_FUTURE':
      return memberIds;
    default:
      return expense.targetMemberIds;
  }
};

const getActiveSplit = (expense: ExpenseShape, memberIds: string[]) =>
  expense.splitAmounts !== null &&
  getSplitMemberIds(expense, memberIds).every(
    (uid) => uid in (expense.splitAmounts ?? {}),
  )
    ? expense.splitAmounts
    : null;

const getMultiplier = (expense: ExpenseShape, split: string[]) =>
  expense.isPerPerson ? Math.max(1, split.length) : 1;

const getTotal = (expense: ExpenseShape, memberIds: string[]) => {
  const amount = getResolvedAmount(expense);
  return amount === null
    ? null
    : scaleAmount(
        amount,
        getMultiplier(expense, getSplitMemberIds(expense, memberIds)),
      );
};

/** The most `uid` could owe toward an expense, or null outside its split or before it has an amount. */
const getShareMax = (
  expense: ExpenseShape,
  memberIds: string[],
  uid: string,
) => {
  const split = getSplitMemberIds(expense, memberIds);
  if (!split.includes(uid)) return null;
  const multiplier = getMultiplier(expense, split);
  const known = getResolvedAmount(expense);
  if (known !== null) {
    const custom = getActiveSplit(expense, memberIds);
    return custom
      ? (custom[uid] ?? 0)
      : (computeEvenSplit(split, scaleAmount(known, multiplier))[uid] ?? 0);
  }
  return expense.amountMin === null || expense.amountMax === null
    ? null
    : (computeEvenSplit(split, scaleAmount(expense.amountMax, multiplier))[
        uid
      ] ?? 0);
};

/** What `debtor` still owes `creditor` across paid expenses, after paid-back marks and early payments. */
const sumRemaining = (
  expenses: ExpenseShape[],
  memberIds: string[],
  debtor: string,
  creditor: string,
) =>
  expenses.reduce((sum, expense) => {
    const total = getTotal(expense, memberIds);
    const split = getSplitMemberIds(expense, memberIds);
    if (
      expense.status !== 'PAID' ||
      expense.payerUid !== creditor ||
      total === null ||
      !split.includes(debtor)
    )
      return sum;
    const share =
      (getActiveSplit(expense, memberIds) ?? computeEvenSplit(split, total))[
        debtor
      ] ?? 0;
    const early = expense.earlyPayments[debtor];
    const applied =
      early && early.toUid === creditor && !early.isReturned
        ? Math.min(early.amount, share)
        : 0;
    const covered = expense.repaidUids.includes(debtor) ? share : applied;
    return sum + share - covered;
  }, 0);

/** Money `from` sent `to` ahead of an expense that `to` is still holding. */
const sumHeld = (
  expenses: ExpenseShape[],
  memberIds: string[],
  from: string,
  to: string,
) =>
  expenses.reduce((sum, expense) => {
    const payment = expense.earlyPayments[from];
    if (!payment || payment.toUid !== to || payment.isReturned) return sum;
    const share =
      expense.status === 'EXPECTED' || expense.payerUid !== to
        ? 0
        : (getShareMax(expense, memberIds, from) ?? 0);
    return sum + payment.amount - Math.min(payment.amount, share);
  }, 0);

const getCounterparts = (
  expenses: ExpenseShape[],
  memberIds: string[],
  uid: string,
) =>
  Array.from(
    new Set(
      expenses.flatMap((expense) => {
        const split = getSplitMemberIds(expense, memberIds);
        const early = Object.entries(expense.earlyPayments).flatMap(
          ([from, payment]) =>
            from === uid
              ? [payment.toUid]
              : payment.toUid === uid
                ? [from]
                : [],
        );
        const paid =
          expense.status !== 'PAID' || expense.payerUid === null
            ? []
            : expense.payerUid === uid
              ? split
              : split.includes(uid)
                ? [expense.payerUid]
                : [];
        return [...early, ...paid];
      }),
    ),
  ).filter((other) => other !== uid);

/** What `uid` owes and is owed on one trip, as the app's Dues summary nets each pair of people. */
export function computeBalance(
  expenses: ExpenseShape[],
  memberIds: string[],
  uid: string,
): Balance {
  const nets = getCounterparts(expenses, memberIds, uid).map(
    (other) =>
      Math.round(
        (sumRemaining(expenses, memberIds, uid, other) -
          sumRemaining(expenses, memberIds, other, uid) -
          sumHeld(expenses, memberIds, uid, other) +
          sumHeld(expenses, memberIds, other, uid)) *
          100,
      ) / 100,
  );
  const toCents = (amounts: number[]) =>
    Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 100);
  return {
    oweCents: toCents(nets.filter((net) => net > EPSILON)),
    owedCents: toCents(nets.filter((net) => net < -EPSILON).map((net) => -net)),
  };
}
