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

/** Whether the person dismissed the suggestion with this key; kept on this device only. */
export function isRecurringDismissed(key: string): boolean {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

export function dismissRecurring(key: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${key}`, '1');
  } catch {
    // Without storage the suggestion simply comes back on the next visit.
  }
  version.value += 1;
  listeners.forEach((listener) => listener());
}
