import { MAX_RECEIPT_TEXT_LENGTH } from '@apps/runway/constants';
import { formatCents } from '@/utils/moneyUtils';
import type { ReceiptReading } from '@/lib/receipts/receiptTypes';

const MORE_ITEMS = /^…and (\d+) more items?$/;
const TOTAL_LABELS = /^(Subtotal|Tax|Fees|Discount|Tip|Total)\s{2,}/;
const MORE_ITEMS_RESERVE = '…and 999 more items'.length + 1;

/** The code of a receipt's currency when it isn't US dollars, otherwise null. */
export function getForeignCurrency(reading: ReceiptReading): string | null {
  const code = reading.currency?.trim().toUpperCase() ?? '';
  return code === '' || code === 'USD' ? null : code;
}

/** The items of a read receipt as text, one per line with its price, then the figures the receipt states; null when it gave nothing to keep. A currency other than dollars is written with its code, never a "$". */
export function formatReceiptItems(reading: ReceiptReading): string | null {
  const foreign = getForeignCurrency(reading);
  const money = (cents: number) =>
    foreign === null
      ? formatCents(cents)
      : `${cents < 0 ? '-' : ''}${foreign} ${(Math.abs(cents) / 100).toFixed(2)}`;
  const priced = (label: string, cents: number | null) =>
    cents === null ? [] : [`${label}  ${money(cents)}`];
  const items = reading.lines
    .map(
      (line) =>
        `${line.name.trim()}${line.quantity > 1 ? ` ×${line.quantity}` : ''}  ${money(line.priceCents)}`,
    )
    .filter((line) => line.trim() !== '');
  const totals = [
    ...priced('Subtotal', reading.subtotalCents),
    ...priced('Tax', reading.taxCents),
    ...priced('Fees', reading.feesCents),
    ...priced(
      'Discount',
      reading.discountCents === null ? null : -reading.discountCents,
    ),
    ...priced('Tip', reading.tipCents),
    ...priced('Total', reading.totalCents),
  ];
  const totalsLength = totals.join('\n').length;
  const fits = (lines: string[]) =>
    [...lines, ...totals].join('\n').length <= MAX_RECEIPT_TEXT_LENGTH;
  if (fits(items)) {
    const all = [...items, ...totals];
    return all.length === 0 ? null : all.join('\n');
  }
  const budget =
    MAX_RECEIPT_TEXT_LENGTH - totalsLength - MORE_ITEMS_RESERVE - 1;
  const ends = items.reduce<number[]>(
    (sums, line) => [...sums, (sums.at(-1) ?? -1) + 1 + line.length],
    [],
  );
  const keptCount = ends.filter((end) => end <= budget).length;
  const left = items.length - keptCount;
  return [
    ...items.slice(0, keptCount),
    `…and ${left} more item${left === 1 ? '' : 's'}`,
    ...totals,
  ].join('\n');
}

/** How many items a stored items text holds, counting an "…and N more items" line as N and leaving the totals out. */
export function countReceiptItems(text: string): number {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !TOTAL_LABELS.test(line))
    .reduce((sum, line) => sum + Number(MORE_ITEMS.exec(line)?.[1] ?? 1), 0);
}

/** A stored line as the name and the price after its last run of two spaces; a line with no price is only a name. */
export function splitReceiptRow(line: string): {
  name: string;
  price: string | null;
} {
  const match = /^(.*\S)\s{2,}(\S.*)$/.exec(line);
  return match === null
    ? { name: line, price: null }
    : { name: match[1], price: match[2] };
}

/** True for the "Total" line a stored items text ends with. */
export const isReceiptTotalRow = (line: string): boolean =>
  /^Total\s{2,}/.test(line);

export interface ReceiptReadOutcome {
  hasTotal: boolean;
  hasStore: boolean;
  hasDay: boolean;
  itemCount: number;
  foreignCurrency: string | null;
  isTotalMissing: boolean;
  isDayRefused: boolean;
  keptAmount: boolean;
  keptStore: boolean;
}

const joinParts = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** What a receipt read filled in and what it left for the person, in one or two plain sentences. */
export function describeReceiptRead(outcome: ReceiptReadOutcome): string {
  const filled = [
    ...(outcome.hasTotal ? ['the total'] : []),
    ...(outcome.hasStore ? ['the store'] : []),
    ...(outcome.hasDay ? ['the day'] : []),
    ...(outcome.itemCount > 0
      ? [outcome.itemCount === 1 ? '1 item' : `${outcome.itemCount} items`]
      : []),
  ];
  const kept = [
    ...(outcome.keptAmount ? ['amount'] : []),
    ...(outcome.keptStore ? ['store'] : []),
  ];
  const sentences = [
    ...(filled.length === 0
      ? []
      : [
          `Read ${joinParts(filled)}.${outcome.hasTotal ? ' Check them before you add it.' : ''}`,
        ]),
    ...(outcome.foreignCurrency === null
      ? []
      : [
          `This receipt is in ${outcome.foreignCurrency}, so type the amount in dollars.`,
        ]),
    ...(outcome.foreignCurrency === null && outcome.isTotalMissing
      ? ['No total was found, so type the amount.']
      : []),
    ...(outcome.isDayRefused
      ? [
          "The day on the receipt isn't one you were tracking, so the day is unchanged.",
        ]
      : []),
    ...(kept.length === 0 ? [] : [`Kept the ${joinParts(kept)} you typed.`]),
  ];
  return sentences.join(' ');
}
