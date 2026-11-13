import { toComparable } from '@/utils/optionMatchUtils';
import { unspill } from '@apps/runway/engine/spill';
import {
  findAccountPairs,
  findPurchaseMatches,
} from '@apps/runway/engine/matching';
import type { OpenPurchase, OpenRule } from '@apps/runway/types';

/** The `target` of a rule that asks every time. */
export const RULE_VARIES = 'varies';

/** Whether a rule names an envelope that is no longer live (archived, ended or turned into a goal), so it sorts nothing until it is given another. A rule that asks every time names none. */
export const needsNewHome = (
  rule: Pick<OpenRule, 'target'>,
  liveEnvelopeIds: ReadonlySet<string>,
): boolean => rule.target !== RULE_VARIES && !liveEnvelopeIds.has(rule.target);

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

const compareRules = (a: OpenRule, b: OpenRule) =>
  getTier(a) - getTier(b) ||
  a.createdAt - b.createdAt ||
  a.id.localeCompare(b.id);

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
  const [best] = rules.filter(fits).sort(compareRules);
  return best ? { rule: best, isAsk: best.target === RULE_VARIES } : null;
}

/** Where purchases go under the rule that now wins them: placed by a live rule (`by`), asked each time, or waiting (no rule fits, or the one that wins is paused). */
export interface NextPlace {
  by: OpenRule | null;
  isAsk: boolean;
}

export interface NextHome extends NextPlace {
  removed: OpenRule;
  /** The card these purchases are on; null for every card no rule names. */
  cardId: string | null;
  /** For a store rule: each kind of place a kind-of-place rule left would win for this store's purchases the bank files under it, where that differs from the rest. */
  byKind: (NextPlace & { category: string })[];
}

const toPlace = (
  match: RuleMatch | null,
  liveEnvelopeIds: ReadonlySet<string>,
): NextPlace => ({
  by:
    match !== null && !match.isAsk && !needsNewHome(match.rule, liveEnvelopeIds)
      ? match.rule
      : null,
  isAsk: match?.isAsk ?? false,
});

/** Where the purchases each removed rule wins today go once it is gone, card by card, by `findRule`'s own ranking; a card where the rule wins nothing (a more specific rule outranks it) has no entry. The main answer is for purchases with no kind of place; a store rule's `byKind` adds the kinds of place a rule left would still claim. */
export function findNextHomes(
  removing: readonly OpenRule[],
  rules: readonly OpenRule[],
  liveEnvelopeIds: ReadonlySet<string>,
): NextHome[] {
  const goingIds = new Set(removing.map((rule) => rule.id));
  const left = rules.filter((rule) => !goingIds.has(rule.id));
  const namedCards = [
    ...new Set(
      rules.flatMap((rule) => (rule.cardId === null ? [] : [rule.cardId])),
    ),
  ];
  const leftKinds = [
    ...new Set(
      left.flatMap((rule) =>
        rule.merchantKey === null && rule.category !== null
          ? [rule.category]
          : [],
      ),
    ),
  ];
  return removing.flatMap((removed) =>
    (removed.cardId === null ? [...namedCards, null] : [removed.cardId])
      .map((cardId) => ({
        cardId,
        facts: {
          merchant: removed.merchantKey,
          category: removed.category,
          cardId,
        },
      }))
      .filter(({ facts }) => findRule(facts, rules)?.rule.id === removed.id)
      .map(({ cardId, facts }) => {
        const place = toPlace(findRule(facts, left), liveEnvelopeIds);
        const byKind =
          removed.merchantKey === null || removed.category !== null
            ? []
            : leftKinds.flatMap((category) => {
                const kindFacts = { ...facts, category };
                if (findRule(kindFacts, rules)?.rule.id !== removed.id)
                  return [];
                const match = findRule(kindFacts, left);
                if (match === null || match.rule.category === null) return [];
                const kind = toPlace(match, liveEnvelopeIds);
                return kind.by?.id === place.by?.id &&
                  kind.isAsk === place.isAsk
                  ? []
                  : [{ ...kind, category }];
              });
        return { removed, cardId, ...place, byKind };
      }),
  );
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

/** The rule that would send this waiting charge on its own, or null; `asked` holds the charges a merge or pair offer is waiting on (pass an empty set to ignore offers). */
export function wouldRulePlace(
  purchase: OpenPurchase,
  rules: readonly OpenRule[],
  envelopeIds: ReadonlySet<string>,
  asked: ReadonlySet<string>,
): OpenRule | null {
  if (
    purchase.source !== 'link' ||
    !purchase.needsHome ||
    purchase.amountCents <= 0 ||
    purchase.assignedBy !== null ||
    purchase.pairedWithId !== null ||
    purchase.incomeDayId !== null ||
    asked.has(purchase.id)
  ) {
    return null;
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
    ? match.rule
    : null;
}

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
    const rule = wouldRulePlace(purchase, rules, envelopeIds, asked);
    return rule ? [{ purchase, rule }] : [];
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
