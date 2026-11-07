import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findAccountPairs } from '@apps/runway/engine/matching';
import type {
  OpenAccount,
  OpenCard,
  OpenLink,
  OpenPurchase,
} from '@apps/runway/types';

/**
 * Whether a bank purchase is part of the history its link brought in: dated before the day the bank was linked.
 * Only purchases added after the link was made can be its history, so a purchase an earlier link of the same account brought in never becomes history when the account is linked again.
 */
export function makeIsLinkHistory(
  links: readonly OpenLink[],
  accounts: readonly OpenAccount[],
  cards: readonly OpenCard[],
): (purchase: OpenPurchase) => boolean {
  const linkById = new Map(links.map((link) => [link.id, link]));
  const linkOf = new Map<string, OpenLink>([
    ...accounts.flatMap((account): [string, OpenLink][] => {
      const link =
        account.linkId === null ? undefined : linkById.get(account.linkId);
      return link ? [[`account:${account.id}`, link]] : [];
    }),
    ...cards.flatMap((card): [string, OpenLink][] => {
      const link = card.linkId === null ? undefined : linkById.get(card.linkId);
      return link ? [[`card:${card.id}`, link]] : [];
    }),
  ]);
  return (purchase) => {
    if (purchase.source !== 'link') return false;
    const link =
      (purchase.paidByCardId
        ? linkOf.get(`card:${purchase.paidByCardId}`)
        : undefined) ??
      (purchase.accountId
        ? linkOf.get(`account:${purchase.accountId}`)
        : undefined);
    if (!link) return false;
    return (
      purchase.createdAt >= link.createdAt &&
      purchase.date < todayAsUtcDate(link.createdAt)
    );
  };
}

/** A history purchase that still counts somewhere: waiting for a home, or placed in spending. */
export const isStillCounted = (purchase: OpenPurchase): boolean =>
  purchase.pairedWithId === null &&
  (purchase.needsHome || purchase.lines.length > 0);

/** The ids of both sides of each clear pair between the person's own accounts dated from `since`, which the pairing pass settles instead. */
export function getPairSideIds(
  waiting: readonly OpenPurchase[],
  since: number,
): Set<string> {
  const byId = new Map(waiting.map((purchase) => [purchase.id, purchase]));
  return new Set(
    [...findAccountPairs(waiting).clear].flatMap(([outId, { inId }]) => {
      const out = byId.get(outId);
      const into = byId.get(inId);
      return out && into && out.date >= since && into.date >= since
        ? [outId, inId]
        : [];
    }),
  );
}
