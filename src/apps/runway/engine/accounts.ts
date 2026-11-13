import { todayAsUtcDate } from '@apps/runway/engine/dates';
import type {
  Cents,
  OpenAccount,
  OpenAccountBalance,
} from '@apps/runway/types';

/** Whether a linked account has a figure from its bank, which is then its balance. */
export const hasBankBalance = (
  account: Pick<OpenAccount, 'id' | 'linkId'>,
  balances: readonly OpenAccountBalance[],
) =>
  account.linkId !== null && balances.some((entry) => entry.id === account.id);

/** What a bank account has on hold that has not posted: its balance less what is available; 0 when none, null without a bank figure. */
export const getPendingCents = (
  bank: Pick<OpenAccountBalance, 'cents' | 'availableCents'> | undefined,
): Cents | null => {
  if (bank === undefined) return null;
  if (bank.availableCents === null) return 0;
  return Math.max(0, bank.cents - bank.availableCents);
};

/** Each linked account with a figure from its bank takes its posted balance, dated the day the bank gave it; the bank is the source of truth once linked. */
export const withBankBalances = (
  accounts: readonly OpenAccount[],
  balances: readonly OpenAccountBalance[],
): OpenAccount[] => {
  const byId = new Map(balances.map((entry) => [entry.id, entry]));
  return accounts.map((account) => {
    const bank = account.linkId === null ? undefined : byId.get(account.id);
    if (bank === undefined) return account;
    return {
      ...account,
      balanceCents: bank.cents,
      balanceOn: todayAsUtcDate(bank.asOf),
    };
  });
};

/** The accounts cards and bills pull from, open ones only. */
export const getPullAccounts = (accounts: readonly OpenAccount[]) =>
  accounts.filter(
    (account) => account.archivedAt === null && account.isPullAccount,
  );

/** A saved account id only while that account is open and pulled from; else null, as if never chosen. Before the accounts load, the id is kept as saved. */
export const keepPullAccountId = (
  id: string | null | undefined,
  accounts: readonly OpenAccount[],
  isLoaded = true,
) => {
  if (!isLoaded) return id ?? null;
  return id && getPullAccounts(accounts).some((a) => a.id === id) ? id : null;
};

/** A saved account id only while that account is open; else null, as if never chosen. Before the accounts load, the id is kept as saved. */
export const keepOpenAccountId = (
  id: string | null | undefined,
  accounts: readonly OpenAccount[],
  isLoaded = true,
) => {
  if (!isLoaded) return id ?? null;
  return id && accounts.some((a) => a.id === id && a.archivedAt === null)
    ? id
    : null;
};

/** The account that pays: the one named when it is an open pull account, else the plan's one pull account, else none. */
export function resolvePayFromAccountId(
  explicitId: string | null | undefined,
  accounts: readonly OpenAccount[],
): string | null {
  const explicit = keepPullAccountId(explicitId, accounts);
  if (explicit) return explicit;
  const pulls = getPullAccounts(accounts);
  return pulls.length === 1 ? pulls[0].id : null;
}

/** Each held id's one holder: when a race left an id in two accounts, the one changed last keeps it. */
export function getHolderById(
  accounts: readonly Pick<OpenAccount, 'id' | 'holds' | 'updatedAt'>[],
): Record<string, string> {
  const byRecent = [...accounts].sort((a, b) => a.updatedAt - b.updatedAt);
  return Object.fromEntries(
    byRecent.flatMap((account) => account.holds.map((id) => [id, account.id])),
  );
}

export interface AccountHoldings {
  items: { id: string; cents: Cents }[];
  heldCents: Cents;
  /** The balance less what the held items hold; null when the balance is not known. */
  unassignedCents: Cents | null;
}

/** What the goals and envelopes an account holds come to, against what it says it holds. An id with no figure holds nothing. */
export function getAccountHoldings(
  account: Pick<OpenAccount, 'holds' | 'balanceCents'>,
  balances: { byId: Record<string, Cents> },
): AccountHoldings {
  const items = account.holds.map((id) => ({
    id,
    cents: balances.byId[id] ?? 0,
  }));
  const heldCents = items.reduce((sum, item) => sum + item.cents, 0);
  return {
    items,
    heldCents,
    unassignedCents:
      account.balanceCents === null ? null : account.balanceCents - heldCents,
  };
}
