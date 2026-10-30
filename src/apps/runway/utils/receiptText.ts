import { MAX_RECEIPT_TEXT_LENGTH } from '@apps/runway/constants';
import { formatCents } from '@/utils/moneyUtils';
import type { ReceiptReading } from '@/lib/receipts/receiptTypes';

/** The items of a read receipt as text, one per line with its price, then the figures the receipt states; null when it gave nothing to keep. */
export function formatReceiptItems(reading: ReceiptReading): string | null {
  const priced = (label: string, cents: number | null) =>
    cents === null ? [] : [`${label}  ${formatCents(cents)}`];
  const lines = [
    ...reading.lines.map(
      (line) =>
        `${line.name.trim()}${line.quantity > 1 ? ` ×${line.quantity}` : ''}  ${formatCents(line.priceCents)}`,
    ),
    ...priced('Subtotal', reading.subtotalCents),
    ...priced('Tax', reading.taxCents),
    ...priced('Tip', reading.tipCents),
    ...priced('Total', reading.totalCents),
  ].filter((line) => line.trim() !== '');
  const kept = lines.reduce<string[]>((held, line) => {
    const length = [...held, line].join('\n').length;
    return length <= MAX_RECEIPT_TEXT_LENGTH ? [...held, line] : held;
  }, []);
  return kept.length === 0 ? null : kept.join('\n');
}
