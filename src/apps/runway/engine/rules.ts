import { toComparable } from '@/utils/optionMatchUtils';
import { unspill } from '@apps/runway/engine/spill';
import {
  findAccountPairs,
  findPurchaseMatches,
} from '@apps/runway/engine/matching';
import type { OpenPurchase, OpenRule } from '@apps/runway/types';

/** The `target` of a rule that asks every time. */
export const RULE_VARIES = 'varies';

/** Stores that sell everything, so what they sold says nothing about the kind of place. */
const BROAD_MERCHANTS = [
  'amazon',
  'amzn',
  'walmart',
  'target',
  'costco',
  'sams club',
  'best buy',
  'kmart',
  'bj s',
  'ebay',
  'etsy',
  'venmo',
];

/** What a rule looks at on a purchase. */
export interface RuleFacts {
  merchant: string | null;
  category: string | null;
  cardId: string | null;
}

export interface RuleMatch {
  rule: OpenRule;
  /** A rule that asks every time never places the purchase. */
  isAsk: boolean;
}

/** The merchant in the one comparable form; null when there is nothing to compare. */
export const toMerchantKey = (merchant: string | null): string | null => {
  const key = toComparable(merchant ?? '');
  return key === '' ? null : key;
};

/** A store that sells everything, or one the person said varies, is never caught by a kind-of-place rule. */
export function isBroadMerchant(
  merchantKey: string | null,
  rules: readonly OpenRule[],
): boolean {
  if (merchantKey === null) return false;
  return (
    BROAD_MERCHANTS.some(
      (name) => merchantKey === name || merchantKey.startsWith(`${name} `),
    ) ||
    rules.some(
      (rule) => rule.merchantKey === merchantKey && rule.target === RULE_VARIES,
    )
  );
}

const isMerchantRule = (rule: OpenRule) => rule.merchantKey !== null;

/** Merchant first, then a kind of place with a card, then a kind of place, then a card. */
const getTier = (rule: OpenRule): number =>
  isMerchantRule(rule)
    ? 0
    : rule.category !== null && rule.cardId !== null
      ? 1
      : rule.category !== null
        ? 2
        : 3;

/** The most specific rule that fits a purchase, or null. A kind-of-place rule skips a broad merchant, and a rule that asks every time comes back with `isAsk`. */
export function findRule(
  facts: RuleFacts,
  rules: readonly OpenRule[],
): RuleMatch | null {
  const merchantKey = toMerchantKey(facts.merchant);
  const isBroad = isBroadMerchant(merchantKey, rules);
  const fits = (rule: OpenRule) =>
    (rule.merchantKey !== null ||
      rule.category !== null ||
      rule.cardId !== null) &&
    (rule.merchantKey === null || rule.merchantKey === merchantKey) &&
    (rule.category === null || rule.category === facts.category) &&
    (rule.cardId === null || rule.cardId === facts.cardId) &&
    !(isBroad && rule.category !== null && rule.merchantKey === null);
  const [best] = rules
    .filter(fits)
    .sort(
      (a, b) =>
        getTier(a) - getTier(b) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
  return best ? { rule: best, isAsk: best.target === RULE_VARIES } : null;
}

export interface RulePlacement {
  purchase: OpenPurchase;
  rule: OpenRule;
}

const getAskedIds = (
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
) => {
  const merges = findPurchaseMatches(waiting, purchases);
  const pairs = findAccountPairs(waiting, true);
  return new Set([
    ...merges.clear.keys(),
    ...merges.offers.keys(),
    ...pairs.clear.keys(),
    ...[...pairs.clear.values()].map(({ inId }) => inId),
    ...pairs.offers.keys(),
  ]);
};

/** Whether a merge or pair offer is waiting on this charge, so a rule leaves it until the person answers. */
export const isHeldByOffer = (
  purchaseId: string,
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
) => getAskedIds(waiting, purchases).has(purchaseId);

/**
 * The waiting bank charges a rule sends on its own: money out, never placed or sent back by the person, unpaired, and with no merge or pair offer (those ask first).
 * A rule that asks every time, or whose envelope is not in `envelopeIds`, places nothing.
 */
export function findRulePlacements(
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  rules: readonly OpenRule[],
  envelopeIds: ReadonlySet<string>,
): RulePlacement[] {
  if (rules.length === 0) return [];
  const asked = getAskedIds(waiting, purchases);
  return waiting.flatMap((purchase): RulePlacement[] => {
    if (
      purchase.source !== 'link' ||
      !purchase.needsHome ||
      purchase.amountCents <= 0 ||
      purchase.assignedBy !== null ||
      purchase.pairedWithId !== null ||
      purchase.incomeDayId !== null ||
      asked.has(purchase.id)
    ) {
      return [];
    }
    const match = findRule(
      {
        merchant: purchase.merchant,
        category: purchase.category,
        cardId: purchase.paidByCardId ?? null,
      },
      rules,
    );
    return match && !match.isAsk && envelopeIds.has(match.rule.target)
      ? [{ purchase, rule: match.rule }]
      : [];
  });
}

const RUN_LENGTH = 3;

export interface PlacementRun {
  envelopeId: string;
  /** The three purchases, newest first. */
  purchaseIds: string[];
}

/** The envelope the person sent this merchant to the last three times in a row, by their own hand, when no rule names the merchant yet; null otherwise. A purchase a rule placed, or one the person has not placed, is not a placement of theirs. */
export function findPlacementRun(
  merchantKey: string | null,
  purchases: readonly OpenPurchase[],
  rules: readonly OpenRule[],
): PlacementRun | null {
  if (
    merchantKey === null ||
    rules.some((rule) => rule.merchantKey === merchantKey)
  ) {
    return null;
  }
  const newest = purchases
    .filter(
      (purchase) =>
        !purchase.needsHome &&
        purchase.amountCents > 0 &&
        purchase.ruleId === null &&
        purchase.assignedBy !== 'auto' &&
        toMerchantKey(purchase.merchant) === merchantKey,
    )
    .sort(
      (a, b) =>
        b.date - a.date ||
        b.createdAt - a.createdAt ||
        a.id.localeCompare(b.id),
    )
    .slice(0, RUN_LENGTH);
  const envelopeIds = newest.map((purchase) => {
    const chosen = unspill(purchase.lines);
    return chosen.length === 1 ? chosen[0].envelopeId : null;
  });
  const [first] = envelopeIds;
  return newest.length === RUN_LENGTH &&
    first !== null &&
    envelopeIds.every((id) => id === first)
    ? { envelopeId: first, purchaseIds: newest.map(({ id }) => id) }
    : null;
}
