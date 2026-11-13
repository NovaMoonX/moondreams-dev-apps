import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findAccountPairs,
  findPurchaseMatches,
  isWaitingCharge,
  type PurchaseMatches,
} from '@apps/runway/engine/matching';
import type {
  OpenAccount,
  OpenCard,
  OpenLink,
  OpenPurchase,
  RouteMemorySealed,
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

/** A bank purchase the person put in an envelope by hand: placed, not by a rule, and not part of a pair. */
export const isPlacedByHand = (purchase: OpenPurchase): boolean =>
  purchase.source === 'link' &&
  !purchase.needsHome &&
  purchase.assignedBy !== 'auto' &&
  purchase.lines.length > 0 &&
  purchase.pairedWithId === null &&
  purchase.amountCents > 0;

/** History purchases the person placed by hand that look like a purchase they had typed for it, so they may be counted twice. Charges still waiting compete for the same typed purchases, so a typed purchase two bank charges could be is never clear. `offers` also holds each clear pair, so one whose merge is refused is still shown. */
export function findHistoryDuplicates(
  purchases: readonly OpenPurchase[],
  isLinkHistory: (purchase: OpenPurchase) => boolean,
): PurchaseMatches {
  const isHistoryPlaced = (purchase: OpenPurchase) =>
    isLinkHistory(purchase) && isPlacedByHand(purchase);
  const matches = findPurchaseMatches(
    purchases,
    purchases,
    (purchase) =>
      isHistoryPlaced(purchase) ||
      (isWaitingCharge(purchase) && !isLinkHistory(purchase)),
  );
  const historyIds = new Set(
    purchases.filter(isHistoryPlaced).map((purchase) => purchase.id),
  );
  const clear = new Map(
    [...matches.clear].filter(([bankId]) => historyIds.has(bankId)),
  );
  return {
    clear,
    offers: new Map([
      ...[...matches.offers].filter(([bankId]) => historyIds.has(bankId)),
      ...[...clear].map(([bankId, typedId]): [string, string[]] => [
        bankId,
        [typedId],
      ]),
    ]),
  };
}

/** The ids of both sides of each clear pair (remembered routes included, as the pairing pass reads them) between the person's own accounts dated from `since`, which the pairing pass settles instead. */
export function getPairSideIds(
  waiting: readonly OpenPurchase[],
  since: number,
  routes: readonly RouteMemorySealed[] = [],
): Set<string> {
  const byId = new Map(waiting.map((purchase) => [purchase.id, purchase]));
  return new Set(
    [...findAccountPairs(waiting, false, routes).clear].flatMap(
      ([outId, { inId }]) => {
        const out = byId.get(outId);
        const into = byId.get(inId);
        return out && into && out.date >= since && into.date >= since
          ? [outId, inId]
          : [];
      },
    ),
  );
}
