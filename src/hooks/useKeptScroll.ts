import { useLayoutEffect } from 'react';

const keptScroll = new Map<string, number>();
const keptHeight = new Map<string, number>();

const readEntryKey = () => {
  const state = window.history.state as { key?: unknown; idx?: unknown } | null;
  if (typeof state?.key === 'string') return state.key;
  return typeof state?.idx === 'number'
    ? `${state.idx}|${window.location.pathname}${window.location.search}`
    : null;
};

/** Puts the window back where it was when the person returns to the same history entry, for a screen rebuilt on Back; a fresh visit starts at the top. Window scroll only. */
export function useKeptScroll(isReady: boolean) {
  useLayoutEffect(() => {
    if (!isReady) return;
    const entryKey = readEntryKey();
    if (entryKey === null) return;
    const kept = keptScroll.get(entryKey);
    if (kept !== undefined) window.scrollTo(0, kept);
    const keep = () => {
      const height = document.documentElement.scrollHeight;
      const isClamped =
        window.scrollY >= height - window.innerHeight - 1 &&
        height < (keptHeight.get(entryKey) ?? 0);
      // The screen leaving shortens the page and pulls the scroll up with it; that is not the person scrolling.
      if (isClamped) return;
      keptScroll.set(entryKey, window.scrollY);
      keptHeight.set(entryKey, height);
    };
    window.addEventListener('scroll', keep, { passive: true });
    return () => window.removeEventListener('scroll', keep);
  }, [isReady]);
}
