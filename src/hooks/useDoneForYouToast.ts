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

/** Says what an app did on its own in one toast with a View, a moment after the last item so a batch is one line; never for items older than a day, and never on a device's first visit. An item is new when this session has not seen it and it either arrived after the page opened or is newer than the device's last stamp, so an entry another clock dated earlier is still said. */
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
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);
  const shown = useRef<{ ids: string[]; at: number } | null>(null);
  const idsKey = items
    .map(({ id }) => id)
    .sort()
    .join(',');

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
    if (seen.current?.key !== storageKey) {
      const toasted = readToasted(storageKey);
      if (toasted === null) keepToasted(storageKey, Date.now());
      seen.current = {
        key: storageKey,
        ids: new Set(
          latest.current.items
            .filter(({ createdAt }) => toasted === null || createdAt <= toasted)
            .map(({ id }) => id),
        ),
      };
      shown.current = null;
    }
    const { ids } = seen.current;
    if (latest.current.items.every(({ id }) => ids.has(id))) return undefined;
    const timer = window.setTimeout(() => {
      const current = latest.current;
      const now = Date.now();
      const unseen = current.items.filter(({ id }) => !ids.has(id));
      unseen.forEach(({ id }) => ids.add(id));
      const fresh = unseen.filter(
        ({ createdAt }) => createdAt > now - MAX_AGE_MS,
      );
      keepToasted(
        storageKey,
        Math.max(
          readToasted(storageKey) ?? 0,
          ...current.items.map(({ createdAt }) => createdAt),
        ),
      );
      if (fresh.length === 0) return;
      const previous = shown.current;
      const isShowing = previous !== null && now - previous.at < SHOWN_MS;
      const said = [
        ...(isShowing ? previous.ids : []),
        ...fresh.map(({ id }) => id),
      ];
      shown.current = { ids: said, at: now };
      // Adding under a shown id stacks a second toast rather than replacing it.
      current.removeToast(TOAST_ID);
      current.addToast({
        id: TOAST_ID,
        title: current.buildTitle(said.length),
        type: 'info',
        action: { label: current.viewLabel, onClick: current.onView },
      });
    }, BATCH_MS);
    return () => window.clearTimeout(timer);
  }, [isReady, storageKey, idsKey]);
}
