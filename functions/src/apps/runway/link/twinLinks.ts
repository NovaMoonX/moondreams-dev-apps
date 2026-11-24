import type { LinkSealed, ProviderAccountSealed } from './linkShared.js';
import { toBankKey } from './unfinishedLinks.js';

/** What tells one bank account apart across sign-ins: its name and mask, as the provider advises for spotting a repeat sign-in. Null without a mask. */
export const toAccountKey = (account: { name: string; mask: string | null }) =>
  account.mask === null || account.mask === ''
    ? null
    : `${account.mask}|${account.name.trim().replace(/\s+/g, ' ').toLowerCase()}`;

/** Whether a link at a bank already holds one of these accounts: the same login signed in again, not a second login at the same bank. */
export function isTwinLink(
  link: Pick<LinkSealed, 'institutionName' | 'providerAccounts'>,
  institutionName: string,
  accounts: readonly { name: string; mask: string | null }[],
) {
  if (toBankKey(link.institutionName) !== toBankKey(institutionName)) {
    return false;
  }
  const held = new Set(
    link.providerAccounts.map(toAccountKey).filter((key) => key !== null),
  );
  return accounts.some((account) => {
    const key = toAccountKey(account);
    return key !== null && held.has(key);
  });
}

export interface CombineMove {
  collection: 'accounts' | 'cards';
  targetId: string;
}

const isPlaced = (entry: ProviderAccountSealed) =>
  entry.accountId !== null || entry.cardId !== null;

/**
 * Folds `drop`'s placed accounts onto the matching accounts of `keep`: each must match exactly one of `keep`'s accounts
 * that is not placed elsewhere. Null when one cannot move, so nothing is combined that would lose a placed account.
 */
export function planCombine(
  keep: Pick<LinkSealed, 'providerAccounts'>,
  drop: Pick<LinkSealed, 'providerAccounts'>,
): { providerAccounts: ProviderAccountSealed[]; moves: CombineMove[] } | null {
  const placed = drop.providerAccounts.filter(isPlaced);
  const pairs = placed.map((entry) => {
    const key = toAccountKey(entry);
    const matches =
      key === null
        ? []
        : keep.providerAccounts.filter((row) => toAccountKey(row) === key);
    return { entry, match: matches.length === 1 ? matches[0] : null };
  });
  const isMovable = pairs.every(
    ({ match }) => match !== null && !isPlaced(match),
  );
  if (!isMovable) return null;
  const byKeep = new Map(
    pairs.map(({ entry, match }) => [
      (match as ProviderAccountSealed).providerAccountId,
      entry,
    ]),
  );
  const providerAccounts = keep.providerAccounts.map((row) => {
    const from = byKeep.get(row.providerAccountId);
    return from
      ? {
          ...row,
          accountId: from.accountId,
          cardId: from.cardId,
          isSkipped: false,
        }
      : row;
  });
  const moves = placed.map(
    (entry): CombineMove =>
      entry.cardId !== null
        ? { collection: 'cards', targetId: entry.cardId }
        : { collection: 'accounts', targetId: entry.accountId as string },
  );
  return { providerAccounts, moves };
}
