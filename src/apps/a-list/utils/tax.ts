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
