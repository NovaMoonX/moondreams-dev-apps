import { toComparable } from '@/utils/optionMatchUtils';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import {
  findBillCandidateIds,
  getMatchedKeys,
  type AutoBill,
} from '@apps/runway/engine/autoPay';
import { isTrackingLevel } from '@apps/runway/engine/level';
import {
  getSpilledLines,
  unspill,
  type SpillInputs,
} from '@apps/runway/engine/spill';
import {
  findAccountPairs,
  findPurchaseMatches,
} from '@apps/runway/engine/matching';
import type {
  DateOnly,
  Level,
  OpenAccount,
  OpenPurchase,
  OpenRule,
  PurchaseLine,
} from '@apps/runway/types';

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

/** Each ticked condition catches on its own: a kind of place on any card, everything on a card. A merchant rule names only its merchant. */
const getMatchTier = (
  rule: OpenRule,
  facts: RuleFacts,
  merchantKey: string | null,
  isBroad: boolean,
): number | null => {
  if (rule.merchantKey !== null) {
    return rule.merchantKey === merchantKey ? 0 : null;
  }
  const isKind =
    rule.category !== null && rule.category === facts.category && !isBroad;
  const isCard = rule.cardId !== null && rule.cardId === facts.cardId;
  return isKind && isCard ? 1 : isKind ? 2 : isCard ? 3 : null;
};

/** The most specific rule that fits a purchase, or null: merchant first, then one whose kind and card both fit, then a kind, then a card. A kind of place never catches a broad merchant, and a rule that asks every time comes back with `isAsk`. */
export function findRule(
  facts: RuleFacts,
  rules: readonly OpenRule[],
): RuleMatch | null {
  const merchantKey = toMerchantKey(facts.merchant);
  const isBroad = isBroadMerchant(merchantKey, rules);
  const [best] = rules
    .flatMap((rule) => {
      const tier = getMatchTier(rule, facts, merchantKey, isBroad);
      return tier === null ? [] : [{ rule, tier }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.rule.createdAt - b.rule.createdAt ||
        a.rule.id.localeCompare(b.rule.id),
    );
  return best
    ? { rule: best.rule, isAsk: best.rule.target === RULE_VARIES }
    : null;
}

export interface RulePlacement {
  purchase: OpenPurchase;
  rule: OpenRule;
}

const getAskedIds = (
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  emailHeld: ReadonlySet<string>,
) => {
  const merges = findPurchaseMatches(waiting, purchases);
  const pairs = findAccountPairs(waiting, true);
  return new Set([
    ...emailHeld,
    ...merges.clear.keys(),
    ...merges.offers.keys(),
    ...pairs.clear.keys(),
    ...[...pairs.clear.values()].map(({ inId }) => inId),
    ...pairs.offers.keys(),
  ]);
};

/** Whether a merge or pair offer is waiting on this charge, so a rule leaves it until the person answers; `emailHeld` holds the charges a waiting emailed purchase is or may be (`getTwinHeldIds`). */
export const isHeldByOffer = (
  purchaseId: string,
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  emailHeld: ReadonlySet<string> = new Set(),
) => getAskedIds(waiting, purchases, emailHeld).has(purchaseId);

/** The rule that would send this waiting charge on its own, or null; `asked` holds the charges a merge or pair offer is waiting on (pass an empty set to ignore offers). */
export function wouldRulePlace(
  purchase: OpenPurchase,
  rules: readonly OpenRule[],
  envelopeIds: ReadonlySet<string>,
  asked: ReadonlySet<string>,
): OpenRule | null {
  if (
    (purchase.source !== 'link' && purchase.source !== 'email') ||
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
 * The waiting bank charges and emailed purchases a rule sends on its own: money out, never placed or sent back by the person, unpaired, and with no merge or pair offer (those ask first).
 * A rule that asks every time, or whose envelope is not in `envelopeIds`, places nothing.
 */
export function findRulePlacements(
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  rules: readonly OpenRule[],
  envelopeIds: ReadonlySet<string>,
  emailHeld: ReadonlySet<string> = new Set(),
): RulePlacement[] {
  if (rules.length === 0) return [];
  const asked = getAskedIds(waiting, purchases, emailHeld);
  return waiting.flatMap((purchase): RulePlacement[] => {
    const rule = wouldRulePlace(purchase, rules, envelopeIds, asked);
    return rule ? [{ purchase, rule }] : [];
  });
}

export interface RulePlacementInput {
  level: Level;
  today: DateOnly;
  /** Every charge waiting for a home, history included. */
  needsHome: readonly OpenPurchase[];
  purchases: readonly OpenPurchase[];
  rules: readonly OpenRule[];
  autoBills: readonly AutoBill[];
  accounts: readonly OpenAccount[];
  /** The envelopes a rule can place into, and the balances their lines are worked out against. */
  spill: SpillInputs;
  twinHeld: ReadonlySet<string>;
  isLinkHistory: (purchase: OpenPurchase) => boolean;
  /** A charge the caller leaves alone, so it takes no share of the batch's balances. */
  isExcluded?: (purchase: OpenPurchase) => boolean;
}

export interface PlannedPlacement extends RulePlacement {
  /** The lines the purchase gets, each worked out seeing what the ones before it in the batch took. */
  lines: PurchaseLine[];
}

/**
 * Every placement a pass makes: the waiting charges a rule fits, leaving out bank history, charges a bill that pays itself is waiting for, and the caller's own exclusions, each with its lines.
 * `postedOnly` also leaves out charges the bank has not posted yet.
 */
export function planRulePlacements(
  input: RulePlacementInput,
  { postedOnly }: { postedOnly: boolean },
): PlannedPlacement[] {
  const { level, today, rules, spill } = input;
  if (!isTrackingLevel(level)) return [];
  const waiting = input.needsHome.filter(
    (purchase) => !input.isLinkHistory(purchase),
  );
  const heldForBills = findBillCandidateIds({
    level,
    today,
    bills: input.autoBills,
    waiting,
    pullAccountId: resolvePayFromAccountId(null, input.accounts),
    matched: getMatchedKeys(input.purchases),
  });
  const found = findRulePlacements(
    waiting,
    input.purchases,
    rules,
    new Set(spill.envelopes.map(({ item }) => item.id)),
    input.twinHeld,
  ).filter(
    ({ purchase }) =>
      !heldForBills.has(purchase.id) &&
      !(postedOnly && purchase.status === 'pending') &&
      !input.isExcluded?.(purchase),
  );
  return found.reduce<PlannedPlacement[]>((done, { purchase, rule }) => {
    const taken = done.flatMap(({ lines }) =>
      lines.map((line) => ({ ...line, cents: -line.cents })),
    );
    const lines = getSpilledLines(
      spill,
      [{ envelopeId: rule.target, cents: purchase.amountCents, via: 'chosen' }],
      taken,
      purchase.date,
    );
    return [...done, { purchase, rule, lines }];
  }, []);
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
