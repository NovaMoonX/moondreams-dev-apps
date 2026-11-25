import type { LinkSealed, ProviderAccountSealed } from './linkShared.js';
import { isTwinLink, toAccountKey } from '../engine/twinLinks.js';

export { isTwinLink, toAccountKey };

export interface CombineMove {
  collection: 'accounts' | 'cards';
  targetId: string;
}

const isPlaced = (entry: ProviderAccountSealed) =>
  entry.accountId !== null || entry.cardId !== null;

/** Folds `drop`'s placed accounts onto `keep`'s matching unplaced ones; null when any cannot move, so no placed account is lost. */
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
  const moves = placed.map((entry): CombineMove =>
    entry.cardId !== null
      ? { collection: 'cards', targetId: entry.cardId }
      : { collection: 'accounts', targetId: entry.accountId as string },
  );
  return { providerAccounts, moves };
}
