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

/** What a row calls a purchase: where, else the note, else the envelope it came from. */
export function getPurchaseTitle(
  purchase: OpenPurchase,
  nameOf: (envelopeId: string) => string,
): string {
  const named = purchase.merchant?.trim() || purchase.note?.trim();
  if (named) return named;
  const where = describeEnvelopes(purchase.lines, nameOf);
  return isRefund(purchase) ? `Refund to ${where}` : where || 'Purchase';
}
