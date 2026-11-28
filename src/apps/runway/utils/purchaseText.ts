import { formatDateOrdinalUTC, formatList } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type {
  Level,
  OpenAccount,
  OpenCard,
  OpenPurchase,
  OpenReleasedCharge,
  PurchaseLine,
  PurchasePairKind,
} from '@apps/runway/types';
import {
  COVER_WORDS,
  ITEM_VIEW_WORDS,
  SPILL_WORDS,
} from '@apps/runway/constants';
import { getCardName } from '@apps/runway/utils/cardText';
import {
  describeEnvelopes,
  describePurchaseAssigned,
  describeSpills,
  FREE_NAME,
  formatSentenceMoney,
  getPurchaseTitle,
  getSpillGroups,
  isRefund,
} from '@apps/runway/engine/doneText';
import { unspill } from '@apps/runway/engine/spill';
import { getLevelWords } from '@apps/runway/utils/levelText';
import { isTrackingLevel } from '@apps/runway/engine/level';

const NOT_COUNTED = 'Not counted';

export {
  describeEnvelopes,
  describePurchaseAssigned,
  describeSpills,
  getPurchaseTitle,
  isRefund,
};

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

/** What an envelope, goal or Horizon item held after one row of its history, in the words its own figure uses ("$412.50 left", "−$18.00 over", "$1,240.00 saved"). */
export function describeHeldAfter(
  kind: 'envelope' | 'goal' | 'horizon',
  level: Level,
  cents: number,
): { text: string; value: string; word: string; isOver: boolean } {
  const parts = (value: string, word: string, isOver: boolean) => ({
    text: `${value} ${word.replaceAll(' ', '\u00a0')}`,
    value,
    word,
    isOver,
  });
  if (kind === 'goal') {
    return parts(formatSigned(cents), ITEM_VIEW_WORDS.goalFigure, false);
  }
  if (kind === 'horizon') {
    return cents < 0
      ? parts(`−${formatCents(-cents)}`, 'over', true)
      : parts(formatCents(cents), ITEM_VIEW_WORDS.horizonFigure, false);
  }
  const figure = describeEnvelopeFigure(level, cents);
  return parts(figure.value, figure.word, figure.word === 'over');
}

const formatSigned = (cents: number) =>
  cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents);

/** What a pick does to an envelope, "$20.00 → −$23.93", read as over when it ends below zero. */
export function describePickEffect(effect: {
  leftCents: number;
  afterCents: number;
}) {
  return {
    text: COVER_WORDS.leftToAfter(
      formatSigned(effect.leftCents),
      formatSigned(effect.afterCents),
    ),
    isOver: effect.afterCents < 0 && effect.afterCents < effect.leftCents,
  };
}

/** Where a pick's "When it runs out" chain sends the rest, or null when it doesn't run out. */
export function describeRunsOut(
  spillTo: readonly (string | null)[],
  nameOf: (envelopeId: string) => string,
): string | null {
  if (spillTo.length === 0) return null;
  return COVER_WORDS.runsOutTo(
    formatList([
      ...new Set(spillTo.map((id) => (id === null ? FREE_NAME : nameOf(id)))),
    ]),
  );
}

/** A pick row's line under its figure: where the rest goes, or that it will ask; nothing while amounts are hidden, so no row stands out. */
export function describePickDetail(
  effect: { afterCents: number; spillTo: readonly (string | null)[] },
  nameOf: (envelopeId: string) => string,
  isHidden: boolean,
): string | null {
  if (isHidden) return null;
  return (
    describeRunsOut(effect.spillTo, nameOf) ??
    (effect.afterCents < 0 ? COVER_WORDS.asksHow : null)
  );
}

/** Where a purchase's money went, in a row's words: its envelopes, or `emptyWhere` ("Not counted" unless the caller knows better) when it has none. */
export function describePurchaseWhere(
  purchase: OpenPurchase,
  envelopes: string,
  isHidden = false,
  emptyWhere = NOT_COUNTED,
) {
  if (purchase.lines.length === 0 || envelopes === '') return emptyWhere;
  return isRefund(purchase) && !isHidden ? `refund to ${envelopes}` : envelopes;
}

/** What the title left out, after the day: the merchant when a label names the row, then the envelopes when either does, or "Not counted" when it counts nowhere. */
export function getPurchaseFacts(
  purchase: OpenPurchase,
  envelopes: string,
  isHidden = false,
  emptyWhere = NOT_COUNTED,
): string[] {
  const label = purchase.label?.trim() || null;
  const merchant = purchase.merchant?.trim() || null;
  const where = describePurchaseWhere(
    purchase,
    envelopes,
    isHidden,
    emptyWhere,
  );
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
  return `${kind} removed: ${getPurchaseTitle(purchase, nameOf)}, ${formatSentenceMoney(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
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
  return `The bank dropped a pending ${kind}: ${what}, ${formatSentenceMoney(Math.abs(charge.amountCents))} on ${formatDateOrdinalUTC(charge.date)}.${tail}`;
}

/** The change-log sentence for keeping a purchase from the bank in Free to Spend, with no envelope. */
export function describePurchaseKeptFree(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  return `Purchase kept in Free to Spend: ${getPurchaseTitle(purchase, nameOf)}, ${formatSentenceMoney(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** The change-log sentence for a bank purchase dated before its bank was linked, which is history and not counted. */
export function describePurchaseHistory(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  const kind = isRefund(purchase) ? 'Money in' : 'Purchase';
  return `${kind} from before the bank was linked, so it is not counted: ${getPurchaseTitle(purchase, nameOf)}, ${formatSentenceMoney(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
}

/** The change-log sentence for putting a sent purchase back in Needs a home. */
export function describePurchaseReturned(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  return `Purchase put back in Needs a home: ${getPurchaseTitle(purchase, nameOf)}, ${formatSentenceMoney(purchase.amountCents)} on ${formatDateOrdinalUTC(purchase.date)}.`;
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
  const deposited = `deposit of ${formatSentenceMoney(deposit.amountCents)} on ${formatDateOrdinalUTC(deposit.date)}`;
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
  if (card) {
    const name = card.name?.trim() ?? '';
    // A short product name ("it", "Gold") only reads with its issuer.
    const isOwnName = name.length > 4 || name.includes(' ');
    return isOwnName ? name : getCardName(card, cards);
  }
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
      ? `card payment of ${formatSentenceMoney(out.amountCents)} from ${names.from} to ${names.to} on ${formatDateOrdinalUTC(into.date)}`
      : `move of ${formatSentenceMoney(out.amountCents)} from ${names.from} to ${names.to} on ${formatDateOrdinalUTC(out.date)}`;
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
  const typedPart = `${getPurchaseTitle(typed, nameOf)}, ${formatSentenceMoney(typed.amountCents)} on ${formatDateOrdinalUTC(typed.date)}`;
  const bankPart = `${getPurchaseTitle(bank, nameOf)}, ${formatSentenceMoney(bank.amountCents)} on ${formatDateOrdinalUTC(bank.date)}`;
  return isSplit
    ? `Match undone: ${typedPart} is its own purchase again, and ${bankPart} waits in Needs a home.`
    : `Matched to your bank: ${typedPart} is ${bankPart}.`;
}

/** The change-log sentence for a store's order email and its bank's alert email joined as one purchase, or for an Undo that keeps them apart. */
export function describeEmailJoin(
  kept: OpenPurchase,
  dropped: OpenPurchase,
  nameOf: (envelopeId: string) => string,
  isSplit: boolean,
): string {
  const keptPart = `${getPurchaseTitle(kept, nameOf)}, ${formatSentenceMoney(kept.amountCents)} on ${formatDateOrdinalUTC(kept.date)}`;
  const droppedPart = `${getPurchaseTitle(dropped, nameOf)}, ${formatSentenceMoney(dropped.amountCents)} on ${formatDateOrdinalUTC(dropped.date)}`;
  return isSplit
    ? `Emails kept apart: ${droppedPart} is its own purchase again, apart from ${keptPart}.`
    : `Two emails about one purchase: ${droppedPart} joined ${keptPart}.`;
}

/** The change-log sentence for an order from a store's email matched to the several charges it posted as, or for an Undo that splits them again. */
export function describeSplitMatch(
  merged: { banks: readonly OpenPurchase[]; typed: OpenPurchase },
  nameOf: (envelopeId: string) => string,
  isSplit: boolean,
): string {
  const typedPart = `${getPurchaseTitle(merged.typed, nameOf)}, ${money(merged.typed.amountCents)} on ${formatDateOrdinalUTC(merged.typed.date)}`;
  const charges = merged.banks
    .map((bank) => money(bank.amountCents))
    .join(', ');
  return isSplit
    ? `Match undone: ${typedPart} is its own purchase again, and its ${merged.banks.length} bank charges (${charges}) wait in Needs a home.`
    : `Matched to your bank: ${typedPart} is ${merged.banks.length} bank charges (${charges}).`;
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
      ? `amount ${formatSentenceMoney(before.amountCents)} to ${formatSentenceMoney(after.amountCents)}`
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

export interface PurchaseChangeParts {
  /** What happened to it, said on its own ("Sent to Pet Care", "Removed"). */
  action: string;
  title: string;
  /** Empty for an edit, which names what changed instead. */
  amount: string;
  date: string;
  /** The rule's sentence when a rule placed it. */
  rule: string | null;
  /** Whatever the sentence adds after its date (where an overspend came from). */
  extra: string;
}

const PURCHASE_CHANGE =
  /^(?:Purchase|Money in|Refund) (.+?): (.+?), (\$[\d,]+\.\d{2}) on ([A-Z][a-z]{2}[\s\u00a0]\d{1,2}(?:st|nd|rd|th)(?:,[\s\u00a0]\d{4})?)\.(?: (.*))?$/s;
const PURCHASE_EDIT =
  /^(?:Purchase|Refund) changed: (.+?), ((?:amount|envelopes|day|paid by|merchant|label|note|link|items|saved again|added to|taken out of|moved from)\b.*)\.$/s;
const RULE_TAIL = /(?:^|\s)By your rule “(.+)”\.$/s;

/** Reads a purchase's change-log sentence back into its parts, or null when it isn't one of those sentences (they are sealed, so old wording stays). */
export function readPurchaseChange(
  summary: string,
): PurchaseChangeParts | null {
  const edit = PURCHASE_EDIT.exec(summary.trim());
  if (edit !== null) {
    return {
      action: `Changed ${edit[2]}`,
      title: edit[1],
      amount: '',
      date: '',
      rule: null,
      extra: '',
    };
  }
  const match = PURCHASE_CHANGE.exec(summary.trim());
  if (match === null) return null;
  const [, what, title, amount, date, rest = ''] = match;
  const rule = RULE_TAIL.exec(rest);
  return {
    action: `${what.charAt(0).toUpperCase()}${what.slice(1)}`,
    title,
    amount,
    date,
    rule: rule?.[1] ?? null,
    extra: (rule ? rest.slice(0, rule.index) : rest).trim(),
  };
}
