import {
  MAX_PAYMENT_METHOD_LENGTH,
  MAX_PAYMENT_METHODS,
} from '@apps/going-once/constants';

/** Trimmed, cut to the cap, deduped without regard to case (the first spelling wins), in the order given, at most the most a sale keeps. */
export const normalizePaymentMethods = (methods: readonly string[]) =>
  methods
    .map((method) => method.trim().slice(0, MAX_PAYMENT_METHOD_LENGTH).trim())
    .filter((method) => method !== '')
    .filter(
      (method, index, all) =>
        all.findIndex(
          (other) => other.toLowerCase() === method.toLowerCase(),
        ) === index,
    )
    .slice(0, MAX_PAYMENT_METHODS);

/** "Cash", "Cash or Venmo", "Cash, Venmo or Zelle". */
export const formatPaymentMethods = (methods: readonly string[]) =>
  methods.length < 2
    ? (methods[0] ?? '')
    : `${methods.slice(0, -1).join(', ')} or ${methods[methods.length - 1]}`;
