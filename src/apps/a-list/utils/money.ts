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
