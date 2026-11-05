import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getCostPriority, getLiveCosts } from '@apps/runway/engine/horizon';
import { PRIORITIES } from '@apps/runway/constants';
import type { HorizonSealed, Priority } from '@apps/runway/types';

const ALL: Priority = 'want';
const dials = new Map<string, Priority>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isCountedAt = (priority: Priority, dial: Priority) =>
  PRIORITIES.indexOf(priority) <= PRIORITIES.indexOf(dial);

/** A Horizon item counts at `dial` when any of its live costs does, each at its own priority; one with none counts at its own. */
export const isHorizonCountedAt = (
  payload: Pick<HorizonSealed, 'priority' | 'costs'>,
  dial: Priority,
) => {
  const live = getLiveCosts(payload);
  return live.length === 0
    ? isCountedAt(payload.priority, dial)
    : live.some((cost) =>
        isCountedAt(getCostPriority(cost, payload.priority), dial),
      );
};

/** How far down the priorities a total counts; in memory only and cleared when the app is left, so a trimmed total never outlives the visit. */
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

/** Puts the dial back to everything when the screen that mounts it goes away. */
export function useClearPriorityDialOnLeave() {
  useEffect(
    () => () => {
      dials.clear();
      listeners.forEach((listener) => listener());
    },
    [],
  );
}
