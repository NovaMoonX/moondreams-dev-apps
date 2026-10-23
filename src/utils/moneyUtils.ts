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

const MONEY_PATTERN = /^\$?\s*(\d{0,7})(?:\.(\d{0,2}))?$/;

/** Parses a typed dollar amount ("25.99", "$25.9", "26") into integer cents; null when it isn't one. */
export function parseMoneyToCents(input: string): number | null {
  const match = input.trim().replace(/,/g, '').match(MONEY_PATTERN);
  if (!match || (match[1] === '' && !match[2])) {
    return null;
  }

  const dollars = Number(match[1] || '0');
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const result = dollars * 100 + cents;
  return result;
}

const PERCENT_PATTERN = /^(\d{1,3})(?:\.(\d{0,2}))?%?$/;

/** Parses a typed percentage in whole or half percents ("10", "12.5") into basis points (1,000, 1,250); null for anything else, zero and above 100% included. */
export function parsePercentToBps(input: string): number | null {
  const match = input.trim().match(PERCENT_PATTERN);
  if (!match) {
    return null;
  }

  const fraction = (match[2] ?? '').padEnd(2, '0');
  const bps = Number(match[1]) * 100 + Number(fraction);
  const isValid = bps > 0 && bps <= 10_000 && bps % 50 === 0;
  return isValid ? bps : null;
}

/** Basis points as a typed percentage ("10", "12.5"). */
export function formatBps(bps: number): string {
  const result = String(bps / 100);
  return result;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCents(cents: number): string {
  const result = currencyFormatter.format(cents / 100);
  return result;
}

/** The value a money input shows for a stored amount ("25.99"). */
export function centsToInputValue(cents: number | null): string {
  if (cents === null) {
    return '';
  }

  const result = (cents / 100).toFixed(2);
  return result;
}
