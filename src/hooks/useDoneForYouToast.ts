import { useEffect, useRef } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

const BATCH_MS = 1500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TOAST_ID = 'done-for-you';
const SHOWN_MS = 10_000;

const readToasted = (key: string): number | null => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const keepToasted = (key: string, time: number) => {
  try {
    localStorage.setItem(key, String(time));
  } catch {
    // Without storage the next visit may say one more batch.
  }
};

interface DoneForYouToastOptions {
  items: readonly { id: string; createdAt: number }[];
  /** Nothing is said until what the app did on its own has been read. */
  isReady: boolean;
  /** Where this device keeps when it last said something. */
  storageKey: string;
  buildTitle: (count: number) => string;
  viewLabel: string;
  onView: () => void;
}

/** Says what an app did on its own in one toast with a View, a moment after the last item so a batch is one line; never for items older than a day, and never on a device's first visit. */
export function useDoneForYouToast({
  items,
  isReady,
  storageKey,
  buildTitle,
  viewLabel,
  onView,
}: DoneForYouToastOptions) {
  const { addToast, removeToast } = useToast();
  const latest = useRef({
    items,
    addToast,
    removeToast,
    buildTitle,
    viewLabel,
    onView,
  });
  const shown = useRef<{ floor: number; at: number } | null>(null);
  const newest = items.reduce(
    (time, item) => Math.max(time, item.createdAt),
    0,
  );

  useEffect(() => {
    latest.current = {
      items,
      addToast,
      removeToast,
      buildTitle,
      viewLabel,
      onView,
    };
  });

  useEffect(() => {
    if (!isReady) return undefined;
    const toasted = readToasted(storageKey);
    if (toasted === null) {
      keepToasted(storageKey, Date.now());
      return undefined;
    }
    if (newest <= toasted) return undefined;
    const timer = window.setTimeout(() => {
      const since = Math.max(readToasted(storageKey) ?? toasted, toasted);
      const now = Date.now();
      const previous = shown.current;
      const isShowing = previous !== null && now - previous.at < SHOWN_MS;
      const floor = Math.max(
        isShowing ? previous.floor : since,
        now - MAX_AGE_MS,
      );
      const current = latest.current;
      const fresh = current.items.filter((item) => item.createdAt > floor);
      keepToasted(storageKey, newest);
      if (fresh.length === 0) return;
      shown.current = { floor, at: now };
      // Adding under a shown id stacks a second toast rather than replacing it.
      current.removeToast(TOAST_ID);
      current.addToast({
        id: TOAST_ID,
        title: current.buildTitle(fresh.length),
        type: 'info',
        action: { label: current.viewLabel, onClick: current.onView },
      });
    }, BATCH_MS);
    return () => window.clearTimeout(timer);
  }, [isReady, storageKey, newest]);
}
