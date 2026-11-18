/** An amount kept in hundredths of an ISO currency's unit, written with that currency's symbol. Always two decimals, since that is how the amounts are kept. */
export const formatMoney = (hundredths: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(hundredths / 100);
  } catch {
    return `${(hundredths / 100).toFixed(2)} ${currency}`;
  }
};
