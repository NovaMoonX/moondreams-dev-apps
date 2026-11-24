import { useEffect, useSyncExternalStore } from 'react';

// Kept out of the URL like an open item request: the rule's sheet adds its own history entry.
let request: string | null = null;
const listeners = new Set<() => void>();

export const setOpenRuleRequest = (next: string | null) => {
  request = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The rule another screen asked the Rules screen to open, until its sheet closes. */
export const useOpenRuleRequest = () =>
  useSyncExternalStore(subscribe, () => request);

let holders = 0;

/** Holds the request while the Rules screen is mounted and drops it once the screen has gone. */
export const useHoldRuleRequest = () =>
  useEffect(() => {
    holders += 1;
    return () => {
      holders -= 1;
      // Deferred, so a remount straight after (React's development double mount) keeps the request.
      window.setTimeout(() => {
        if (holders === 0) setOpenRuleRequest(null);
      }, 0);
    };
  }, []);
