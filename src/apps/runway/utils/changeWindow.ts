import { DAY_MS } from '@apps/runway/engine/dates';

/** The instants one page of the change log reads: `span` days ending `page` windows before the end of `today`, newest page 0. */
export function getChangeWindow(today: number, span: number, page: number) {
  const to = today + DAY_MS - page * span * DAY_MS;
  const result = { from: to - span * DAY_MS, to };
  return result;
}

/** One string for a window and its item filter, so a listener and the screen agree on what was read. */
export function toChangeWindowKey(
  window: { from: number; to: number },
  itemId: string | null,
) {
  const result = `${window.from},${window.to},${itemId ?? ''}`;
  return result;
}
