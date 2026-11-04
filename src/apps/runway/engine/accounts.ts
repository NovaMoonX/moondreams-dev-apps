import type { Cents, OpenAccount } from '@apps/runway/types';

/** The accounts cards and bills pull from, open ones only. */
export const getPullAccounts = (accounts: readonly OpenAccount[]) =>
  accounts.filter(
    (account) => account.archivedAt === null && account.isPullAccount,
  );

/** The account that pays: the one named when it is open, else the plan's one pull account, else none. */
export function resolvePayFromAccountId(
  explicitId: string | null | undefined,
  accounts: readonly OpenAccount[],
): string | null {
  const isExplicitOpen = accounts.some(
    (account) => account.id === explicitId && account.archivedAt === null,
  );
  if (explicitId && isExplicitOpen) return explicitId;
  const pulls = getPullAccounts(accounts);
  return pulls.length === 1 ? pulls[0].id : null;
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
