import { Item } from '../types';

export const RECENT_REVEAL_WINDOW_MS = 3_600_000;

export function getWasRecentlyRevealed(item: Item): boolean {
  const now = Date.now();
  const hasRecentReveal =
    item.isRevealed &&
    item.revealedAt !== null &&
    now !== null &&
    item.revealedAt >= now - RECENT_REVEAL_WINDOW_MS;

  return hasRecentReveal;
}
