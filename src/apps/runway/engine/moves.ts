import type { Cents, DateOnly, OpenAccount } from '@apps/runway/types';

import { DAY_MS } from './dates';
import { keepOpenAccountId, resolvePayFromAccountId } from './accounts';

/** Days a confirmed day's moves look ahead when no later income day is known. */
export const MOVE_WINDOW_DAYS = 31;

export interface MoveBillInput {
  id: string;
  name: string;
  dueOn: DateOnly;
  cents: Cents;
  paidByCardId: string | null;
  accountId: string | null;
}

export interface MoveCardInput {
  id: string;
  name: string;
  /** The due day still owed for, null when the card is paid up or has no due day. */
  dueOn: DateOnly | null;
  /** What it owes today. */
  cents: Cents;
  payFromAccountId: string | null;
}

export interface MoveItem {
  kind: 'bill' | 'card';
  id: string;
  name: string;
  dueOn: DateOnly;
  cents: Cents;
}

export interface AccountMove {
  accountId: string;
  /** The account the day's pay landed in, when it names an open one. */
  fromAccountId: string | null;
  /** The earliest due date among the items. */
  byOn: DateOnly;
  pullsCents: Cents;
  /** The typed balance taken off, only when it is as new as the day; else null. */
  balanceCents: Cents | null;
  moveCents: Cents;
  items: MoveItem[];
}

export interface AccountMovesInput {
  accounts: readonly OpenAccount[];
  /** The confirmed day's arrived date, else its date. */
  dayOn: DateOnly;
  /** The next income day's date, null when none is known. */
  nextIncomeOn: DateOnly | null;
  /** The account the day's pay lands in. */
  payAccountId: string | null;
  /** A payment due before today has already pulled, or is late and shown as such elsewhere, so it is not moved for. */
  today: DateOnly;
  bills: readonly MoveBillInput[];
  cards: readonly MoveCardInput[];
}

/** The window a confirmed day's moves cover: its date up to, not including, the next income day. */
export const getMoveWindow = (
  dayOn: DateOnly,
  nextIncomeOn: DateOnly | null,
) => ({
  start: dayOn,
  end: nextIncomeOn ?? dayOn + MOVE_WINDOW_DAYS * DAY_MS,
});

/**
 * What to move into each pull account after an income day: what pulls from it before the next income
 * day, less its typed balance when that was given on or after the day. A balance typed earlier is not
 * trusted, only items due from the balance's date count against a newer one, and nothing due before today counts.
 */
export function getAccountMoves(input: AccountMovesInput): AccountMove[] {
  const { accounts, dayOn, payAccountId } = input;
  const { start, end } = getMoveWindow(dayOn, input.nextIncomeOn);
  const from = Math.max(start, input.today);
  const isInWindow = (dueOn: DateOnly) => dueOn >= from && dueOn < end;
  const fromAccountId = keepOpenAccountId(payAccountId, accounts);
  const billItems = input.bills
    .filter(
      (bill) =>
        bill.paidByCardId === null && bill.cents > 0 && isInWindow(bill.dueOn),
    )
    .map((bill): MoveItem & { pullAccountId: string | null } => ({
      kind: 'bill',
      id: bill.id,
      name: bill.name,
      dueOn: bill.dueOn,
      cents: bill.cents,
      pullAccountId: resolvePayFromAccountId(bill.accountId, accounts),
    }));
  const cardItems = input.cards.flatMap((card) =>
    card.dueOn !== null && card.cents > 0 && isInWindow(card.dueOn)
      ? [
          {
            kind: 'card' as const,
            id: card.id,
            name: card.name,
            dueOn: card.dueOn,
            cents: card.cents,
            pullAccountId: resolvePayFromAccountId(
              card.payFromAccountId,
              accounts,
            ),
          },
        ]
      : [],
  );
  const result = accounts
    .filter(
      (account) =>
        account.archivedAt === null &&
        account.isPullAccount &&
        account.id !== fromAccountId,
    )
    .flatMap((account): AccountMove[] => {
      const isFresh =
        account.balanceCents !== null &&
        account.balanceOn !== null &&
        account.balanceOn >= start;
      const since = isFresh ? Math.max(account.balanceOn ?? from, from) : from;
      const items = [...billItems, ...cardItems]
        .filter(
          (item) => item.pullAccountId === account.id && item.dueOn >= since,
        )
        .map(({ kind, id, name, dueOn, cents }): MoveItem => ({
          kind,
          id,
          name,
          dueOn,
          cents,
        }))
        .sort((a, b) => a.dueOn - b.dueOn || a.name.localeCompare(b.name));
      const pullsCents = items.reduce((sum, item) => sum + item.cents, 0);
      const balanceCents = isFresh ? account.balanceCents : null;
      const moveCents = Math.max(0, pullsCents - (balanceCents ?? 0));
      return moveCents === 0
        ? []
        : [
            {
              accountId: account.id,
              fromAccountId,
              byOn: items[0].dueOn,
              pullsCents,
              balanceCents,
              moveCents,
              items,
            },
          ];
    })
    .sort((a, b) => a.byOn - b.byOn || a.accountId.localeCompare(b.accountId));
  return result;
}
