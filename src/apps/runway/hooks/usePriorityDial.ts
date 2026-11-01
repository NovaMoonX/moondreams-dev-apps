import { useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { PRIORITIES } from '@apps/runway/constants';
import type { Priority } from '@apps/runway/types';

const ALL: Priority = 'want';
const dials = new Map<string, Priority>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether an item of `priority` counts in a total the dial is set to. */
export const isCountedAt = (priority: Priority, dial: Priority) =>
  PRIORITIES.indexOf(priority) <= PRIORITIES.indexOf(dial);

/** How far down the priorities Plan's totals count; held in memory for this visit only, so a trimmed total never outlives it. */
export function usePriorityDial() {
  const { user } = useAuth();
  const key = user?.uid ?? '';
  const dial = useSyncExternalStore(
    subscribe,
    () => dials.get(key) ?? ALL,
    () => ALL,
  );
  const setDial = (next: Priority) => {
    if ((dials.get(key) ?? ALL) === next) return;
    dials.set(key, next);
    listeners.forEach((listener) => listener());
  };
  return { dial, setDial, isTrimmed: dial !== ALL };
}
