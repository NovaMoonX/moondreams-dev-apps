import { DAY_MS } from '@apps/runway/engine/dates';
import { AUTO_PAY_DAYS } from '@apps/runway/constants';

const KEY_PREFIX = 'runway-charge-snooze';

const keyFor = (paymentKey: string) => `${KEY_PREFIX}:${paymentKey}`;

const listeners = new Set<() => void>();
const version = { value: 0 };

/** Changes whenever a question is put off. */
export const subscribeChargeSnoozes = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getChargeSnoozeVersion = () => version.value;

/** Whether the payment's question is put off; kept on this device only. */
export function isChargeSnoozed(paymentKey: string, now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(keyFor(paymentKey))) > now;
  } catch {
    return false;
  }
}

export function snoozeCharge(paymentKey: string, now = Date.now()): void {
  try {
    localStorage.setItem(
      keyFor(paymentKey),
      String(now + AUTO_PAY_DAYS.snoozeDays * DAY_MS),
    );
  } catch {
    // Without storage the question simply comes back on the next visit.
  }
  version.value += 1;
  listeners.forEach((listener) => listener());
}
