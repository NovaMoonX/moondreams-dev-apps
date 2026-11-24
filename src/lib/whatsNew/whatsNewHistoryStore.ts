import { useSyncExternalStore } from 'react';

import type { WhatsNewScope } from './whatsNewTypes';

let openScope: WhatsNewScope | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const set = (next: WhatsNewScope | null) => {
  if (next === openScope) return;
  openScope = next;
  listeners.forEach((listener) => listener());
};

/** Asks the host to open a scope's history; the account menu has no other way to reach it. */
export const openWhatsNewHistory = (scope: WhatsNewScope) => set(scope);

export const closeWhatsNewHistory = () => set(null);

/** The scope whose history is open, or null. */
export const useOpenWhatsNewHistory = () =>
  useSyncExternalStore(
    subscribe,
    () => openScope,
    () => null,
  );
