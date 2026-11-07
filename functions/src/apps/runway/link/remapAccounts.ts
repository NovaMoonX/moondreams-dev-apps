import type { ProviderAccountSealed } from './linkShared.js';
import type { NormalizedAccount } from './provider.js';

/**
 * Settles a link's bank accounts against what the bank returns after a reconnect: kept ids stay, a replaced
 * account (same mask and kind, old id gone) takes over its predecessor's bindings, anything else new is added unbound.
 */
export function remapAccounts(
  current: readonly ProviderAccountSealed[],
  returned: readonly NormalizedAccount[],
): { providerAccounts: ProviderAccountSealed[]; newAccounts: number } {
  const returnedIds = new Set(returned.map((a) => a.providerAccountId));
  const knownIds = new Set(current.map((entry) => entry.providerAccountId));
  const vanished = current.filter(
    (entry) => !returnedIds.has(entry.providerAccountId),
  );
  const unknown = returned.filter(
    (account) => !knownIds.has(account.providerAccountId),
  );
  const matchesOf = (account: NormalizedAccount) =>
    account.mask === null
      ? []
      : vanished.filter(
          (entry) => entry.mask === account.mask && entry.kind === account.kind,
        );
  const takeovers = new Map(
    unknown.flatMap((account) => {
      const matches = matchesOf(account);
      const rivals = unknown.filter(
        (other) => other.mask === account.mask && other.kind === account.kind,
      );
      return matches.length === 1 && rivals.length === 1
        ? [[matches[0].providerAccountId, account] as const]
        : [];
    }),
  );
  const takenIds = new Set(
    [...takeovers.values()].map((account) => account.providerAccountId),
  );
  const remapped = current.map((entry): ProviderAccountSealed => {
    const account = takeovers.get(entry.providerAccountId);
    return account
      ? {
          ...entry,
          providerAccountId: account.providerAccountId,
          name: account.name,
        }
      : entry;
  });
  const added = unknown
    .filter((account) => !takenIds.has(account.providerAccountId))
    .map((account): ProviderAccountSealed => ({
      providerAccountId: account.providerAccountId,
      name: account.name,
      kind: account.kind,
      mask: account.mask,
      balanceCents: account.balanceCents,
      accountId: null,
      cardId: null,
      isSkipped: false,
    }));
  return {
    providerAccounts: [...remapped, ...added],
    newAccounts: added.length,
  };
}
