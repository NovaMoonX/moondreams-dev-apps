import {
  CATEGORY_LABELS,
  CATEGORY_PRIMARIES,
  RULE_WORDS,
} from '@apps/runway/constants';
import { RULE_VARIES } from '@apps/runway/engine/rules';
import type {
  OpenPurchase,
  PurchaseLine,
  RuleSealed,
} from '@apps/runway/types';
import { describePurchaseAssigned } from '@apps/runway/utils/purchaseText';

const toSentenceCase = (code: string) => {
  const text = code.toLowerCase().replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** A kind of place as people say it; a code nobody named reads as its last part ("Storage"). */
export function getCategoryLabel(code: string): string {
  const known = CATEGORY_LABELS[code];
  if (known) return known;
  const primary = CATEGORY_PRIMARIES.find((entry) =>
    code.startsWith(`${entry}_`),
  );
  return toSentenceCase(primary ? code.slice(primary.length + 1) : code);
}

const isPlural = (label: string) => /s$/.test(label) && label !== 'Gas';

export interface RuleNames {
  /** The target envelope's name. */
  envelope: string;
  /** The rule's card, when it names one. */
  card: string | null;
  /** The sentence sits under its card's heading, so it leaves the card out. */
  isCardLeftOut?: boolean;
}

/** The rule as a sentence: "Restaurants on Venture X go to Dining out", "Safeway goes to Groceries", "Amazon: ask which envelope each time". */
export function describeRule(rule: RuleSealed, names: RuleNames): string {
  const { merchantName, category, cardId } = rule;
  if (merchantName !== null && rule.target === RULE_VARIES) {
    return `${merchantName}: ${RULE_WORDS.askEvery.toLowerCase()}`;
  }
  const onCard = names.isCardLeftOut ? '' : ` on ${names.card ?? 'a card'}`;
  const subject =
    merchantName ??
    (category === null
      ? `Everything${onCard}`
      : `${getCategoryLabel(category)}${cardId === null ? '' : onCard}`);
  const verb =
    merchantName !== null
      ? 'goes'
      : category === null
        ? 'goes'
        : isPlural(getCategoryLabel(category))
          ? 'go'
          : 'goes';
  return `${subject} ${verb} to ${names.envelope}`;
}

/** The change-log sentence for a purchase a rule sent to its envelope. */
export function describeRulePlaced(
  purchase: OpenPurchase,
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
  sentence: string,
): string {
  return `${describePurchaseAssigned(purchase, lines, nameOf)} By your rule “${sentence}”.`;
}
