import { useSyncExternalStore } from 'react';

export interface SiteNotice {
  label: string;
  actionLabel: string;
  onAction: () => void;
}

let notice: SiteNotice | null = null;
let lastNotice: SiteNotice | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Raises (or clears, with null) the one notice the site's top strip shows while nothing about the connection needs saying; the strip pushes the header and pages down like the offline banner. */
export const setSiteNotice = (next: SiteNotice | null) => {
  if (next === notice) return;
  notice = next;
  lastNotice = next ?? lastNotice;
  listeners.forEach((listener) => listener());
};

/** The notice the top strip shows, or null. */
export const useSiteNotice = () =>
  useSyncExternalStore(
    subscribe,
    () => notice,
    () => null,
  );

/** The last notice raised, kept after it clears so the strip can slide it away without repainting. */
export const getLastSiteNotice = () => lastNotice;
