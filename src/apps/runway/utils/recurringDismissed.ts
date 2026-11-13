const KEY_PREFIX = 'runway-recurring-dismissed:';

const listeners = new Set<() => void>();
const version = { value: 0 };

/** Changes whenever a repeating-charge suggestion is dismissed. */
export const subscribeRecurringDismissals = (listener: () => void) => {
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

export const getRecurringDismissedVersion = () => version.value;

const keyFor = (uid: string, key: string) => `${KEY_PREFIX}${uid}:${key}`;

/** Whether this person dismissed the suggestion with this key; kept on this device only, per signed-in person. */
export function isRecurringDismissed(uid: string, key: string): boolean {
  try {
    return localStorage.getItem(keyFor(uid, key)) !== null;
  } catch {
    return false;
  }
}

export function dismissRecurring(uid: string, key: string): void {
  try {
    localStorage.setItem(keyFor(uid, key), '1');
  } catch {
    // Without storage the suggestion simply comes back on the next visit.
  }
  version.value += 1;
  listeners.forEach((listener) => listener());
}
