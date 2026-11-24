import { toComparable } from '@/utils/optionMatchUtils';

export const getMerchantWords = (name: string | null) =>
  toComparable(name?.trim() || '')
    .split(' ')
    .filter((word) => word !== '' && !/^\d+$/.test(word));

// A bank adds store numbers and short codes ("KOHLS #1234", "TARGET T-0456"); a longer word ("Venmo cash out", "Applebees") is another merchant.
export const isSameMerchant = (a: readonly string[], b: readonly string[]) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (Math.min(a.join('').length, b.join('').length) < 3) return false;
  if (a.join('') === b.join('')) return true;
  return (
    short.length > 0 &&
    short.every((word, index) => long[index] === word) &&
    long
      .slice(short.length)
      .every((word) => word.length <= 2 || /\d/.test(word))
  );
};

/** Whether two merchant names (or labels) name the same store, store numbers, spacing and punctuation aside. */
export const isSameStore = (a: string | null, b: string | null) =>
  isSameMerchant(getMerchantWords(a), getMerchantWords(b));
