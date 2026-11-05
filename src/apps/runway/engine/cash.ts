import { getHolderById } from '@apps/runway/engine/accounts';
import type { Balances } from '@apps/runway/engine/balances';
import type {
  Cents,
  DateOnly,
  OpenAccount,
  OpenPurchase,
} from '@apps/runway/types';

export interface CashPositionInput {
  /** Every account, archived and uncounted ones included, so a goal's holder is found. */
  accounts: readonly OpenAccount[];
  /** What the bank last said each linked account holds, by account id. */
  bankBalances: Readonly<Record<string, Cents>>;
  balances: Pick<
    Balances,
    | 'assignedByItem'
    | 'assignedToBillsCents'
    | 'assignedToHorizonCents'
    | 'assignedToCardsCents'
    | 'assignedToEnvelopesCents'
  >;
  /** The goals whose money the balances count (open, not released). */
  goalIds: readonly string[];
  purchases: readonly Pick<
    OpenPurchase,
    'source' | 'status' | 'amountCents' | 'accountId'
  >[];
}

export interface CashAccount {
  id: string;
  name: string;
  /** The bank's figure for a linked account, else the typed one; null when neither is known. */
  cents: Cents | null;
  isBank: boolean;
  balanceOn: DateOnly | null;
}

export interface CashPosition {
  accounts: CashAccount[];
  cashCents: Cents;
  billsCents: Cents;
  goalsCents: Cents;
  horizonCents: Cents;
  cardsCents: Cents;
  pendingCents: Cents;
  committedCents: Cents;
  envelopesCents: Cents;
  freeCents: Cents;
  overAssignedCents: Cents;
}

/** Where the cash in the accounts that count goes: what is committed, what sits in envelopes and what is free. The parts add back to the cash exactly. */
export function getCashPosition(input: CashPositionInput): CashPosition {
  const counts = (account: OpenAccount) =>
    account.countedTowardTotal && account.archivedAt === null;
  const counted = input.accounts.filter(counts);
  const countedIds = new Set(counted.map((account) => account.id));
  const accounts = counted.map((account): CashAccount => {
    const bank =
      account.linkId !== null ? (input.bankBalances[account.id] ?? null) : null;
    return {
      id: account.id,
      name: account.name,
      cents: bank ?? account.balanceCents,
      isBank: bank !== null,
      balanceOn: account.balanceOn,
    };
  });
  const cashCents = accounts.reduce((sum, a) => sum + (a.cents ?? 0), 0);

  const holderById = getHolderById(input.accounts);
  const isHeldOutside = (id: string) => {
    const holder = holderById[id];
    return holder !== undefined && !countedIds.has(holder);
  };
  const goalsCents = input.goalIds
    .filter((id) => !isHeldOutside(id))
    .reduce((sum, id) => sum + (input.balances.assignedByItem[id] ?? 0), 0);
  const pendingCents = input.purchases
    .filter(
      (purchase) =>
        purchase.source === 'link' &&
        purchase.status === 'pending' &&
        purchase.amountCents > 0 &&
        purchase.accountId !== null &&
        countedIds.has(purchase.accountId),
    )
    .reduce((sum, purchase) => sum + purchase.amountCents, 0);

  const { balances } = input;
  const committedCents =
    balances.assignedToBillsCents +
    goalsCents +
    balances.assignedToHorizonCents +
    balances.assignedToCardsCents +
    pendingCents;
  const free = cashCents - committedCents - balances.assignedToEnvelopesCents;
  return {
    accounts,
    cashCents,
    billsCents: balances.assignedToBillsCents,
    goalsCents,
    horizonCents: balances.assignedToHorizonCents,
    cardsCents: balances.assignedToCardsCents,
    pendingCents,
    committedCents,
    envelopesCents: balances.assignedToEnvelopesCents,
    freeCents: Math.max(0, free),
    overAssignedCents: Math.max(0, -free),
  };
}
