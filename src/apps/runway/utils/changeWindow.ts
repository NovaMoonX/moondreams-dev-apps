import { DAY_MS } from '@apps/runway/engine/dates';

/** The instants one page of the change log reads, as local midnights (an entry's `createdAt` is an instant), and the first and last day they cover as date-only values. `span` days end `page` windows before the end of `today`, newest page 0. */
export function getChangeWindow(today: number, span: number, page: number) {
  const toLocalMidnight = (day: number) => {
    const date = new Date(day);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ).getTime();
  };
  const endDay = today + DAY_MS - page * span * DAY_MS;
  const startDay = endDay - span * DAY_MS;
  const result = {
    from: toLocalMidnight(startDay),
    to: toLocalMidnight(endDay),
    firstDay: startDay,
    lastDay: endDay - DAY_MS,
  };
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
