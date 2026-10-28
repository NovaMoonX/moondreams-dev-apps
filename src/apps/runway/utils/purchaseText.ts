import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type { Level, OpenPurchase, PurchaseLine } from '@apps/runway/types';
import { getLevelWords } from '@apps/runway/utils/levelText';

const FREE_NAME = 'Free to spend';

/** An envelope's figure with its word: assigned at Plan, and at Track what is left or how far over. */
export function describeEnvelopeFigure(level: Level, cents: number) {
  if (level === 'track' && cents < 0) {
    return { value: `−${formatCents(-cents)}`, word: 'over' };
  }
  return {
    value: formatCents(cents),
    word: getLevelWords(level).envelopeFigure,
  };
}

/** The names a purchase comes out of: up to three, then "and N more". */
export function describeEnvelopes(
  lines: readonly PurchaseLine[],
  nameOf: (envelopeId: string) => string,
): string {
  const names = lines.map((line) =>
    line.envelopeId === null ? FREE_NAME : nameOf(line.envelopeId),
  );
  if (names.length <= 3)
    return names.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export const isRefund = (purchase: OpenPurchase) => purchase.amountCents < 0;

/** What a row calls a purchase: where, else the note, else the envelope it came from. While amounts are hidden a refund is named like any purchase, so the words never give its sign away. */
export function getPurchaseTitle(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
  isHidden = false,
): string {
  const named = purchase.merchant?.trim() || purchase.note?.trim();
  if (named) return named;
  const where = describeEnvelopes(purchase.lines, nameOf);
  return isRefund(purchase) && !isHidden
    ? `Refund to ${where}`
    : where || 'Purchase';
}

interface PurchaseFields {
  date: number;
  amountCents: number;
  merchant: string | null;
  note: string | null;
  lines: readonly PurchaseLine[];
}

const money = (cents: number) => formatCents(Math.abs(cents));

/** The change-log sentence for removing a purchase. */
export function describePurchaseRemoval(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  const kind = isRefund(purchase) ? 'Refund' : 'Purchase';
  return `${kind} removed: ${getPurchaseTitle(purchase, nameOf)}, ${money(purchase.amountCents)} on ${formatDateUTC(purchase.date)}.`;
}

/** The change-log sentence for an edit: only what changed, from and to. */
export function describePurchaseEdit(
  before: OpenPurchase,
  after: PurchaseFields,
  nameOf: (envelopeId: string) => string,
): string {
  const was = (value: string | null) => value?.trim() || 'nothing';
  const shape = (lines: readonly PurchaseLine[]) =>
    describeEnvelopes(lines, nameOf);
  const key = (lines: readonly PurchaseLine[]) =>
    lines.length > 1
      ? lines.map((line) => `${line.envelopeId}:${line.cents}`).join()
      : shape(lines);
  const changes = [
    after.amountCents !== before.amountCents
      ? `amount ${money(before.amountCents)} to ${money(after.amountCents)}`
      : null,
    key(after.lines) !== key(before.lines)
      ? `envelopes ${shape(before.lines)} to ${shape(after.lines)}`
      : null,
    after.date !== before.date
      ? `day ${formatDateUTC(before.date)} to ${formatDateUTC(after.date)}`
      : null,
    (after.merchant?.trim() || null) !== (before.merchant?.trim() || null)
      ? `where ${was(before.merchant)} to ${was(after.merchant)}`
      : null,
    (after.note?.trim() || null) !== (before.note?.trim() || null)
      ? 'note'
      : null,
  ].filter((entry): entry is string => entry !== null);
  const kind = isRefund(before) ? 'Refund' : 'Purchase';
  return `${kind} changed: ${getPurchaseTitle(before, nameOf)}, ${changes.join('; ') || 'saved again'}.`;
}
