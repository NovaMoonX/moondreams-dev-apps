import { DAY_MS } from '@apps/runway/engine/dates';
import { AUTO_PAY_WORDS } from '@apps/runway/constants';

const KEY_PREFIX = 'runway-charge-snooze';

/** A payment's key holds only the bill's id and the due day, never a name or an amount. */
const keyFor = (paymentKey: string) => `${KEY_PREFIX}:${paymentKey}`;

const listeners = new Set<() => void>();
const version = { value: 0 };

/** Changes whenever a question is put off, so a screen that lists the questions draws again. */
export const subscribeChargeSnoozes = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getChargeSnoozeVersion = () => version.value;

/** Whether the person put this payment's "Which charge was this?" off and the time is not up; kept on this device only. */
export function isChargeSnoozed(paymentKey: string, now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(keyFor(paymentKey))) > now;
  } catch {
    return false;
  }
}

/** Puts a payment's question off for a few days. */
export function snoozeCharge(paymentKey: string, now = Date.now()): void {
  try {
    localStorage.setItem(
      keyFor(paymentKey),
      String(now + AUTO_PAY_WORDS.snoozeDays * DAY_MS),
    );
  } catch {
    // Without storage the question simply comes back on the next visit.
  }
  version.value += 1;
  listeners.forEach((listener) => listener());
}
