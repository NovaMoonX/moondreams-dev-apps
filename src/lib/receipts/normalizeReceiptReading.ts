import {
  MAX_RECEIPT_ADDRESS_LENGTH,
  MAX_RECEIPT_CENTS,
  MAX_RECEIPT_LINES,
  MAX_RECEIPT_NAME_LENGTH,
  MAX_RECEIPT_QUANTITY,
  MAX_RECEIPT_SUGGESTED_TIPS,
  RECEIPT_KINDS,
  type ReceiptKind,
  type ReceiptReading,
} from '@/lib/receipts/receiptTypes';
import { clipAtWord } from '@/utils/stringUtils';

type Raw = Record<string, unknown>;

const toCents = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_RECEIPT_CENTS ? Math.round(value) : null;

const toQuantity = (value: unknown): number => {
  const quantity = typeof value === 'string' ? Number(value) : value;
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_RECEIPT_QUANTITY
    ? Math.round(quantity * 10) / 10
    : 1;
};

const toNonNegativeCents = (value: unknown): number | null => {
  const cents = toCents(value);
  return cents !== null && cents >= 0 ? cents : null;
};

const toText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? clipAtWord(value, max) : null;

const toKind = (value: unknown): ReceiptKind | null =>
  RECEIPT_KINDS.find((kind) => kind === value) ?? null;

const toRecords = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);

/** Settles whatever the model answered into a `ReceiptReading`: cents are whole and never negative, text is cut at a word, and a malformed date or time reads as unstated. */
export function normalizeReceiptReading(parsed: Raw): ReceiptReading {
  const rawLines = toRecords(parsed.lines);
  const priced = rawLines.flatMap((line) => {
    const name = toText(line?.name, MAX_RECEIPT_NAME_LENGTH);
    const priceCents = toNonNegativeCents(line?.priceCents);
    const quantity = toQuantity(line?.quantity);
    return name !== null && priceCents !== null
      ? [{ name, quantity, unitPriceCents: toNonNegativeCents(line?.unitPriceCents), priceCents }]
      : [];
  });
  const suggestedTips = toRecords(parsed.suggestedTips)
    .flatMap((tip) =>
      typeof tip?.percent === 'number' && tip.percent > 0 && tip.percent <= 100
        ? [{ percent: tip.percent, tipCents: toNonNegativeCents(tip.tipCents), totalCents: toNonNegativeCents(tip.totalCents) }]
        : [],
    )
    .filter((tip, index, all) => all.findIndex((other) => other.percent === tip.percent) === index)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, MAX_RECEIPT_SUGGESTED_TIPS);

  const reading: ReceiptReading = {
    merchant: toText(parsed.merchant, MAX_RECEIPT_NAME_LENGTH),
    kind: toKind(parsed.kind),
    address: toText(parsed.address, MAX_RECEIPT_ADDRESS_LENGTH),
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    time: typeof parsed.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time) ? parsed.time : null,
    currency: typeof parsed.currency === 'string' && /^[A-Za-z]{3}$/.test(parsed.currency) ? parsed.currency.toUpperCase() : null,
    lines: priced.slice(0, MAX_RECEIPT_LINES),
    unpricedLineCount: rawLines.length - priced.length + Math.max(0, priced.length - MAX_RECEIPT_LINES),
    subtotalCents: toNonNegativeCents(parsed.subtotalCents),
    taxCents: toNonNegativeCents(parsed.taxCents),
    feesCents: toNonNegativeCents(parsed.feesCents),
    discountCents: toNonNegativeCents(parsed.discountCents),
    tipCents: toNonNegativeCents(parsed.tipCents),
    suggestedTips,
    totalCents: toNonNegativeCents(parsed.totalCents),
  };
  return reading;
}
