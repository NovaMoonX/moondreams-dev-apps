/** A minor-units amount in an ISO currency, written the way the person reads it in that currency's own fraction digits. */
export const formatMoney = (minorUnits: number, currency: string) => {
  try {
    const format = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minorUnits / 10 ** digits);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
};
