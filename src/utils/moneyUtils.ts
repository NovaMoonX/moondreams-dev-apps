const AMOUNT_PATTERN = /^\d*\.?\d*$/;

/** A typed dollar amount settled to two decimals ("25" → "25.00"); anything that isn't a plain amount is left as typed. */
export function toTwoDecimalAmount(value: string) {
  const cleaned = value.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  const isAmount = AMOUNT_PATTERN.test(cleaned) && /\d/.test(cleaned);
  if (!isAmount) {
    return value;
  }

  const result = Number(cleaned).toFixed(2);
  return result;
}
