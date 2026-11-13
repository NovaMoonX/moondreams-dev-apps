import type { ChargedPlace } from '@apps/runway/engine/chargedTo';

const KEY_PREFIX = 'runway-charged-to-declined';

const keyFor = (uid: string, billId: string, place: ChargedPlace) =>
  `${KEY_PREFIX}:${uid}:${billId}:${place.kind}:${place.id}`;

const listeners = new Set<() => void>();
const version = { value: 0 };

/** Changes whenever a suggestion is declined. */
export const subscribeChargedToDeclines = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !event.key.startsWith(KEY_PREFIX)) return;
    version.value += 1;
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

export const getChargedToDeclinedVersion = () => version.value;

/** Whether the person said "Not this one" to charging the bill to that place; kept on this device only. */
export function isChargedToDeclined(
  uid: string,
  billId: string,
  place: ChargedPlace,
): boolean {
  try {
    return localStorage.getItem(keyFor(uid, billId, place)) !== null;
  } catch {
    return false;
  }
}

export function declineChargedTo(
  uid: string,
  billId: string,
  place: ChargedPlace,
): void {
  try {
    localStorage.setItem(keyFor(uid, billId, place), '1');
  } catch {
    // Without storage the suggestion simply comes back on the next visit.
  }
  version.value += 1;
  listeners.forEach((listener) => listener());
}
