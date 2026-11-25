import { formatDateOrdinalUTC, formatList } from '@/utils/formatUtils';
import {
  CATEGORY_LABELS,
  CATEGORY_PRIMARIES,
  DONE_FOR_YOU_ENGINE_WORDS,
  RULE_ENGINE_WORDS,
  SPILL_ENGINE_WORDS,
} from './engineConstants';
import { RULE_VARIES } from './rules';
import type {
  Cents,
  DoneForYouSealed,
  DoneForYouSubject,
  OpenPurchase,
  PurchaseLine,
  RuleSealed,
} from '@apps/runway/types';

export const FREE_NAME = 'Free to Spend';

// Money is formatted here because the shared formatter can show made-up amounts, and a kept sentence never may.
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const formatSentenceMoney = (cents: number) =>
  currency.format(Math.abs(cents) / 100);

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

/** The rule in two parts, what it catches and where that goes, for a row that shows them on two lines: "Gas on any card, and everything on Citi" over "Go to Gas". */
export function describeRuleParts(
  rule: RuleSealed,
  names: RuleNames,
): { subject: string; outcome: string } {
  const { merchantName, category, cardId } = rule;
  if (merchantName !== null && rule.target === RULE_VARIES) {
    return { subject: merchantName, outcome: RULE_ENGINE_WORDS.askEvery };
  }
  const onCard = names.isCardLeftOut
    ? ' on this card'
    : ` on ${names.card ?? 'a card'}`;
  const kind = category === null ? null : getCategoryLabel(category);
  const subject =
    merchantName ??
    (kind === null
      ? `Everything${names.isCardLeftOut ? '' : onCard}`
      : cardId === null
        ? kind
        : `${kind} on any card, and everything${onCard}`);
  const verb =
    merchantName === null &&
    kind !== null &&
    (cardId !== null || isPlural(kind))
      ? 'Go'
      : 'Goes';
  return { subject, outcome: `${verb} to ${names.envelope}` };
}

/** The rule as a sentence: "Restaurants go to Dining out", "Everything on Venture X goes to Dining out", "Gas on any card, and everything on Citi, go to Gas", "Safeway goes to Groceries", "Amazon: ask me every time". */
export function describeRule(rule: RuleSealed, names: RuleNames): string {
  const { subject, outcome } = describeRuleParts(rule, names);
  if (rule.merchantName !== null && rule.target === RULE_VARIES) {
    return `${subject}: ${outcome.toLowerCase()}`;
  }
  const isTwoTicks =
    rule.merchantName === null &&
    rule.category !== null &&
    rule.cardId !== null;
  return `${subject}${isTwoTicks ? ',' : ''} ${outcome.charAt(0).toLowerCase()}${outcome.slice(1)}`;
}

export const isRefund = (purchase: OpenPurchase) => purchase.amountCents < 0;

/** The names a purchase comes out of as the person chose them (a spill is not a choice): up to three, then "and N more". */
export function describeEnvelopes(
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
): string {
  const names = lines
    .filter((line) => line.via !== 'spill')
    .map((line) =>
      line.envelopeId === null ? FREE_NAME : nameOf(line.envelopeId),
    );
  if (names.length <= 3)
    return names.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** What a row calls a purchase, in ranked order: the person's label, else the merchant, else the envelopes it came from; never the note. While amounts are hidden a refund is named like any purchase, so the words never give its sign away. */
export function getPurchaseTitle(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
  isHidden = false,
): string {
  const named = purchase.label?.trim() || purchase.merchant?.trim();
  if (named) return named;
  const where = describeEnvelopes(purchase.lines, nameOf);
  if (where === '')
    return isRefund(purchase) && !isHidden ? 'Refund' : 'Purchase';
  return isRefund(purchase) && !isHidden ? `Refund to ${where}` : where;
}

export interface SpillGroup {
  fromId: string;
  parts: { sourceId: string | null; source: string; cents: Cents }[];
}

export const getSpillGroups = (
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
) =>
  lines
    .reduce<{ fromId: string | null; group: SpillGroup | null }[]>(
      (acc, line) => {
        if (line.via !== 'spill')
          return [...acc, { fromId: line.envelopeId, group: null }];
        const last = acc[acc.length - 1];
        if (!last || last.fromId === null) return acc;
        const part = {
          sourceId: line.envelopeId,
          source:
            line.envelopeId === null ? FREE_NAME : nameOf(line.envelopeId),
          cents: line.cents,
        };
        const parts = [...(last.group?.parts ?? []), part];
        return [
          ...acc.slice(0, -1),
          { ...last, group: { fromId: last.fromId, parts } },
        ];
      },
      [],
    )
    .flatMap((entry) => (entry.group === null ? [] : [entry.group]));

/** One change-log sentence per envelope that ran out, naming where its overage came from. */
export function describeSpills(
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
): string[] {
  return getSpillGroups(lines, nameOf).map((group) =>
    SPILL_ENGINE_WORDS.ranOut(
      nameOf(group.fromId),
      formatList(
        group.parts.map((part) =>
          SPILL_ENGINE_WORDS.part(formatSentenceMoney(part.cents), part.source),
        ),
      ),
    ),
  );
}

/** The change-log sentence for sending a waiting purchase to its envelopes, or leaving it out of spending. */
export function describePurchaseAssigned(
  purchase: OpenPurchase,
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
): string {
  const kind = isRefund(purchase) ? 'Money in' : 'Purchase';
  const where =
    lines.length === 0
      ? 'left out of spending'
      : `sent to ${describeEnvelopes(lines, nameOf)}`;
  const spills = describeSpills(lines, nameOf).map((spill) => ` ${spill}.`);
  return `${kind} ${where}: ${getPurchaseTitle(purchase, nameOf)}, ${formatSentenceMoney(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.${spills.join('')}`;
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

/** A subject with every key written, so a pass names only what it has. */
export const toSubject = (
  known: Partial<DoneForYouSubject>,
): DoneForYouSubject => ({
  purchaseId: null,
  merchant: null,
  merchantLogo: null,
  amountCents: null,
  ruleId: null,
  billId: null,
  itemId: null,
  toName: null,
  toEmoji: null,
  fromName: null,
  ...known,
});

/** The purchase an entry acted on, as its merchant, logo and amount. */
export const toPurchaseSubject = (
  purchase: OpenPurchase,
  known: Partial<DoneForYouSubject> = {},
): DoneForYouSubject =>
  toSubject({
    purchaseId: purchase.id,
    merchant: purchase.merchant ?? purchase.label ?? null,
    merchantLogo: purchase.merchantLogo ?? null,
    amountCents: purchase.amountCents,
    ...known,
  });

/** The Done for you entry id of a rule's placement: the device and the server both write it, so one placement is one entry whichever got there first. `purchase` is as it was before the placement. */
export const getRuleEntryId = (
  purchase: Pick<OpenPurchase, 'id' | 'updatedAt'>,
) => `rule-${purchase.id}-${purchase.updatedAt}`;

/** What a rule's placement records: `placed` is the purchase as written, `names` the envelopes' looks by id. */
export function toRulePlacedSealed(
  placed: OpenPurchase,
  sentence: string,
  names: ReadonlyMap<string, { name: string; emoji: string | null }>,
): DoneForYouSealed {
  const nameOf = (envelopeId: string) =>
    names.get(envelopeId)?.name ?? 'An envelope';
  const envelopeId =
    placed.lines.find((line) => line.via === 'chosen')?.envelopeId ?? '';
  return {
    title: DONE_FOR_YOU_ENGINE_WORDS.ruleSent(
      getPurchaseTitle(placed, nameOf),
      nameOf(envelopeId),
    ),
    detail: null,
    why: `${RULE_ENGINE_WORDS.yourRule}, ${sentence}`,
    undo: { kind: 'rule', placed },
    subject: toPurchaseSubject(placed, {
      ruleId: placed.ruleId,
      itemId: envelopeId === '' ? null : envelopeId,
      toName: names.get(envelopeId)?.name ?? null,
      toEmoji: names.get(envelopeId)?.emoji ?? null,
    }),
  };
}
