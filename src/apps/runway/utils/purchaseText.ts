import { formatDateOrdinalUTC, formatList } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type {
  Cents,
  Level,
  OpenAccount,
  OpenCard,
  OpenPurchase,
  OpenReleasedCharge,
  PurchaseLine,
  PurchasePairKind,
} from '@apps/runway/types';
import { SPILL_WORDS } from '@apps/runway/constants';
import { getCardName } from '@apps/runway/utils/cardText';
import { unspill } from '@apps/runway/engine/spill';
import { getLevelWords } from '@apps/runway/utils/levelText';
import { isTrackingLevel } from '@apps/runway/engine/level';

const FREE_NAME = 'Free to Spend';
const NOT_COUNTED = 'Not counted';

/** An envelope's figure with its word: assigned at Plan, and at Track what is left (safe to spend at Link) or how far over. */
export function describeEnvelopeFigure(level: Level, cents: number) {
  if (isTrackingLevel(level) && cents < 0) {
    return { value: `−${formatCents(-cents)}`, word: 'over' };
  }
  return {
    value: formatCents(cents),
    word: getLevelWords(level).envelopeFigure,
  };
}

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

export const isRefund = (purchase: OpenPurchase) => purchase.amountCents < 0;

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

/** Where a purchase's money went, in a row's words: its envelopes, or "Not counted" when it is left out of spending. */
export function describePurchaseWhere(
  purchase: OpenPurchase,
  envelopes: string,
  isHidden = false,
) {
  if (purchase.lines.length === 0 || envelopes === '') return NOT_COUNTED;
  return isRefund(purchase) && !isHidden ? `refund to ${envelopes}` : envelopes;
}

/** What the title left out, after the day: the merchant when a label names the row, then the envelopes when either does, or "Not counted" when it counts nowhere. */
export function getPurchaseFacts(
  purchase: OpenPurchase,
  envelopes: string,
  isHidden = false,
): string[] {
  const label = purchase.label?.trim() || null;
  const merchant = purchase.merchant?.trim() || null;
  const where = describePurchaseWhere(purchase, envelopes, isHidden);
  if (label === null && merchant === null)
    return purchase.lines.length === 0 ? [where] : [];
  return [label !== null ? merchant : null, where].filter(
    (fact): fact is string => Boolean(fact),
  );
}

interface PurchaseFields {
  date: number;
  amountCents: number;
  merchant: string | null;
  label: string | null;
  note: string | null;
  lines: readonly PurchaseLine[];
  paidByCardId: string | null;
  link: string | null;
  receiptText: string | null;
  expenseId: string | null;
}

const money = (cents: number) => formatCents(Math.abs(cents));

interface SpillGroup {
  fromId: string;
  parts: { sourceId: string | null; source: string; cents: Cents }[];
}

const getSpillGroups = (
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
    SPILL_WORDS.ranOut(
      nameOf(group.fromId),
      formatList(
        group.parts.map((part) =>
          SPILL_WORDS.part(money(part.cents), part.source),
        ),
      ),
    ),
  );
}

/** Chain steps passed over for having nothing left: those before the last one that paid, or all of them once Free to Spend took a share. */
export function getSkippedSteps(
  chain: readonly string[],
  selfId: string,
  isKnown: (envelopeId: string) => boolean,
  paidIds: ReadonlySet<string>,
  isFreeUsed: boolean,
): string[] {
  const steps = chain.filter(
    (id, index) => id !== selfId && isKnown(id) && chain.indexOf(id) === index,
  );
  const last = isFreeUsed
    ? steps.length - 1
    : steps.reduce((at, id, index) => (paidIds.has(id) ? index : at), -1);
  return steps.filter((id, index) => index <= last && !paidIds.has(id));
}

/** The preview's sentence for each envelope the save would run dry, leading with the cause and naming any step skipped for having nothing left. */
export function describeSpillPreview(
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
  chainOf: (envelopeId: string) => readonly string[],
  isKnown: (envelopeId: string) => boolean,
): string[] {
  return getSpillGroups(lines, nameOf).map((group) => {
    const skipped = getSkippedSteps(
      chainOf(group.fromId),
      group.fromId,
      isKnown,
      new Set(group.parts.flatMap((part) => part.sourceId ?? [])),
      group.parts.some((part) => part.sourceId === null),
    ).map(nameOf);
    return SPILL_WORDS.runsOut(
      nameOf(group.fromId),
      skipped,
      formatList(
        group.parts.map((part) =>
          SPILL_WORDS.part(money(part.cents), part.source),
        ),
      ),
    );
  });
}

/** The change-log sentence for removing a purchase. */
export function describePurchaseRemoval(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  const kind = isRefund(purchase) ? 'Refund' : 'Purchase';
  return `${kind} removed: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** The change-log sentence for a placed pending charge the bank dropped, and what it no longer counts against. */
export function describeReleasedCharge(
  charge: OpenReleasedCharge,
  nameOf: (envelopeId: string) => string,
): string {
  const isRefund = charge.amountCents < 0;
  const kind = isRefund ? 'refund' : 'charge';
  const what = charge.title ?? `A pending ${kind}`;
  const where = describeEnvelopes(charge.lines, nameOf);
  const tail = where
    ? ` It no longer ${isRefund ? 'adds to' : 'counts against'} ${where}.`
    : '';
  return `The bank dropped a pending ${kind}: ${what}, ${money(Math.abs(charge.amountCents))} on ${formatDateOrdinalUTC(charge.date)}.${tail}`;
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
  return `${kind} ${where}: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.${spills.join('')}`;
}

/** The change-log sentence for keeping a purchase from the bank in Free to Spend, with no envelope. */
export function describePurchaseKeptFree(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  return `Purchase kept in Free to Spend: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** The change-log sentence for a bank purchase dated before its bank was linked, which is history and not counted. */
export function describePurchaseHistory(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  const kind = isRefund(purchase) ? 'Money in' : 'Purchase';
  return `${kind} from before the bank was linked, so it is not counted: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** The change-log sentence for putting a sent purchase back in Needs a home. */
export function describePurchaseReturned(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  return `Purchase put back in Needs a home: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** What a deposit linked to an income day is called in a sentence: the day's pay, by its date. */
export const describePayDay = (on: number) =>
  `${formatDateOrdinalUTC(on)}’s pay`;

/** The change-log sentence for a deposit linked to an income day, or sent back to Needs a home. */
export function describeDepositLinked(
  deposit: OpenPurchase,
  dayOn: number,
  isUnlinked: boolean,
): string {
  const deposited = `deposit of ${money(deposit.amountCents)} on ${formatDateOrdinalUTC(deposit.date)}`;
  return isUnlinked
    ? `Money in put back in Needs a home: ${deposited}, no longer linked to ${describePayDay(dayOn)}.`
    : `Money in linked to pay: ${deposited} is ${describePayDay(dayOn)}.`;
}

/** The card or account a purchase was paid with, short enough for a row ("Venture X", "360 Checking"); null for cash or one typed with no card. */
export function getPaidWithName(
  purchase: OpenPurchase,
  cards: readonly OpenCard[],
  accounts: readonly OpenAccount[],
): string | null {
  const card = purchase.paidByCardId
    ? cards.find((entry) => entry.id === purchase.paidByCardId)
    : undefined;
  if (card) return card.name?.trim() || getCardName(card, cards);
  const account = purchase.accountId
    ? accounts.find((entry) => entry.id === purchase.accountId)
    : undefined;
  if (!account) return null;
  return account.name.trim() || account.institution.trim() || null;
}

/** The account or card one side of a pair sits on, in the person's words. */
export const getPairSideName = (
  purchase: OpenPurchase,
  accounts: readonly OpenAccount[],
  cardNameOf: (cardId: string | null) => string,
) =>
  purchase.paidByCardId
    ? cardNameOf(purchase.paidByCardId)
    : (accounts.find((account) => account.id === purchase.accountId)?.name ??
      'An account');

/** The change-log sentence for money out and money in paired as a move between the person's own accounts, or sent back to Needs a home. */
export function describeAccountPair(
  out: OpenPurchase,
  into: OpenPurchase,
  kind: PurchasePairKind,
  names: { from: string; to: string },
  isUnpaired: boolean,
): string {
  const what =
    kind === 'cardPayment'
      ? `card payment of ${money(out.amountCents)} from ${names.from} to ${names.to} on ${formatDateOrdinalUTC(into.date)}`
      : `move of ${money(out.amountCents)} from ${names.from} to ${names.to} on ${formatDateOrdinalUTC(out.date)}`;
  return isUnpaired
    ? `Money out and in put back in Needs a home: the ${what}, no longer paired.`
    : `Money out and in paired: the ${what}.`;
}

/** The change-log sentence for a bank purchase matched to the one typed by hand, or for an Undo that splits them again. */
export function describePurchaseMatch(
  bank: OpenPurchase,
  typed: OpenPurchase,
  nameOf: (envelopeId: string) => string,
  isSplit: boolean,
): string {
  const typedPart = `${getPurchaseTitle(typed, nameOf)}, ${money(typed.amountCents)} on ${formatDateOrdinalUTC(typed.date)}`;
  const bankPart = `${getPurchaseTitle(bank, nameOf)}, ${money(bank.amountCents)} on ${formatDateOrdinalUTC(bank.date)}`;
  return isSplit
    ? `Match undone: ${typedPart} is its own purchase again, and ${bankPart} waits in Needs a home.`
    : `Matched to your bank: ${typedPart} is ${bankPart}.`;
}

const describeGroupChange = (
  before: string | null,
  after: string | null,
  groupNameOf: (expenseId: string) => string,
) => {
  if (before === after) return null;
  if (before === null) return `added to ${groupNameOf(after ?? '')}`;
  if (after === null) return `taken out of ${groupNameOf(before)}`;
  return `moved from ${groupNameOf(before)} to ${groupNameOf(after)}`;
};

/** The change-log sentence for an edit: only what changed, from and to. */
export function describePurchaseEdit(
  before: OpenPurchase,
  after: PurchaseFields,
  nameOf: (envelopeId: string) => string,
  cardNameOf: (cardId: string | null) => string,
  groupNameOf: (expenseId: string) => string,
): string {
  const was = (value: string | null) => value?.trim() || 'nothing';
  const shape = (lines: readonly PurchaseLine[]) =>
    describeEnvelopes(lines, nameOf);
  const key = (lines: readonly PurchaseLine[]) =>
    unspill(lines).length > 1
      ? unspill(lines)
          .map((line) => `${line.envelopeId}:${line.cents}`)
          .join()
      : shape(lines);
  const spillKey = (lines: readonly PurchaseLine[]) =>
    lines
      .filter((line) => line.via === 'spill')
      .map((line) => `${line.envelopeId}:${line.cents}`)
      .join();
  const changes = [
    after.amountCents !== before.amountCents
      ? `amount ${money(before.amountCents)} to ${money(after.amountCents)}`
      : null,
    key(after.lines) !== key(before.lines)
      ? `envelopes ${shape(before.lines)} to ${shape(after.lines)}`
      : null,
    spillKey(after.lines) !== spillKey(before.lines)
      ? describeSpills(after.lines, nameOf).join('; ') ||
        'no longer spills over'
      : null,
    after.date !== before.date
      ? `day ${formatDateOrdinalUTC(before.date)} to ${formatDateOrdinalUTC(after.date)}`
      : null,
    (after.paidByCardId ?? null) !== (before.paidByCardId ?? null)
      ? `paid by ${cardNameOf(before.paidByCardId ?? null)} to ${cardNameOf(after.paidByCardId ?? null)}`
      : null,
    (after.merchant?.trim() || null) !== (before.merchant?.trim() || null)
      ? `merchant ${was(before.merchant)} to ${was(after.merchant)}`
      : null,
    (after.label?.trim() || null) !== (before.label?.trim() || null)
      ? `label ${was(before.label)} to ${was(after.label)}`
      : null,
    (after.note?.trim() || null) !== (before.note?.trim() || null)
      ? 'note'
      : null,
    (after.link?.trim() || null) !== (before.link?.trim() || null)
      ? 'link'
      : null,
    (after.receiptText?.trim() || null) !== (before.receiptText?.trim() || null)
      ? 'items'
      : null,
    describeGroupChange(
      before.expenseId ?? null,
      after.expenseId ?? null,
      groupNameOf,
    ),
  ].filter((entry): entry is string => entry !== null);
  const kind = isRefund(before) ? 'Refund' : 'Purchase';
  return `${kind} changed: ${getPurchaseTitle(before, nameOf)}, ${changes.join('; ') || 'saved again'}.`;
}
