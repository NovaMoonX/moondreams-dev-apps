/** The tax rate a bill implies (total ÷ cost − 1), rounded to four decimals. */
export function getTaxRateFromBill(
  costCents: number,
  totalCents: number,
): number {
  if (costCents <= 0) {
    return 0;
  }

  const result = Math.round((totalCents / costCents - 1) * 10_000) / 10_000;
  return result;
}

/** "7.5%", "8.875%": the rate as a percent with up to three decimals, trimmed. */
export function formatTaxRate(rate: number): string {
  const percent = Number((rate * 100).toFixed(3));
  const result = `${percent}%`;
  return result;
}

/** Tax on an itemized price: half-up rounding; no rate means no tax. The fee is untaxed. */
export function getItemizedTaxCents(
  priceCents: number,
  taxRate: number | null,
): number {
  const result = taxRate === null ? 0 : Math.round(priceCents * taxRate);
  return result;
}

/** Splits an all-in total so price + fee + tax always add back to it exactly. */
export function splitAllInTotal(
  totalCents: number,
  feeCents: number,
  taxRate: number | null,
): { priceCents: number; taxCents: number } {
  const beforeFee = totalCents - feeCents;
  const priceCents =
    taxRate === null ? beforeFee : Math.round(beforeFee / (1 + taxRate));
  const result = { priceCents, taxCents: beforeFee - priceCents };
  return result;
}
