import { formatDateUTC } from '@/utils/formatUtils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { WEEK_STARTS_ON } from '@apps/a-list/constants';
import type {
  ShareRangeKind,
  SharedViewing,
  Viewing,
} from '@apps/a-list/types';
import { getDayKey, getWeekBounds } from '@apps/a-list/utils/dayKeys';

export interface DayKeyRange {
  startKey: string;
  endKey: string;
}

const DAY_MS = 86_400_000;

/** The inclusive local days a quick option stands for; null for the custom range. */
export function getQuickShareRange(
  kind: ShareRangeKind,
  now: number,
): DayKeyRange | null {
  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthRange = (offset: number) => ({
    startKey: getDayKey(new Date(year, month + offset, 1).getTime()),
    endKey: getDayKey(new Date(year, month + offset + 1, 0).getTime()),
  });

  if (kind === 'THIS_WEEK') {
    return getWeekBounds(now, WEEK_STARTS_ON);
  }
  if (kind === 'NEXT_WEEK') {
    const nextWeek = new Date(year, month, today.getDate() + 7, 12).getTime();
    return getWeekBounds(nextWeek, WEEK_STARTS_ON);
  }
  if (kind === 'THIS_MONTH') return monthRange(0);
  if (kind === 'NEXT_MONTH') return monthRange(1);
  return null;
}

/** Whole days from start to end, both included; 0 when either key is not a date. */
export function getRangeDayCount({ startKey, endKey }: DayKeyRange) {
  const start = fromDateInputValue(startKey);
  const end = fromDateInputValue(endKey);
  if (start === undefined || end === undefined) return 0;

  const result = Math.round((end - start) / DAY_MS) + 1;
  return result;
}

/** The viewings on the range's local days, in showtime order, trimmed to what a visitor may see. */
export function pickSharedViewings(
  viewings: Viewing[],
  { startKey, endKey }: DayKeyRange,
): SharedViewing[] {
  const result = viewings
    .filter((viewing) => {
      const dayKey = getDayKey(viewing.showtimeAt);
      return dayKey >= startKey && dayKey <= endKey;
    })
    .sort((left, right) => left.showtimeAt - right.showtimeAt)
    .map((viewing) => ({
      title: viewing.movie.title,
      posterUrl: viewing.movie.posterUrl ?? null,
      runtimeMinutes: viewing.movie.runtimeMinutes ?? null,
      contentRating: viewing.movie.contentRating ?? null,
      showtimeAt: viewing.showtimeAt,
      status: viewing.status,
      format: viewing.ticket?.format ?? null,
      theatreName: viewing.theatre?.name ?? null,
    }));
  return result;
}

export function groupSharedViewingsByDay(viewings: SharedViewing[]) {
  const byDay = viewings.reduce<Map<string, SharedViewing[]>>(
    (groups, viewing) => {
      const dayKey = getDayKey(viewing.showtimeAt);
      groups.set(dayKey, [...(groups.get(dayKey) ?? []), viewing]);
      return groups;
    },
    new Map(),
  );
  const result = Array.from(byDay, ([dayKey, items]) => ({
    dayKey,
    viewings: items,
  })).sort((left, right) => left.dayKey.localeCompare(right.dayKey));
  return result;
}

/** "October 1 – October 31", or one date for a single day. */
export function formatShareRange(startDate: number, endDate: number) {
  if (startDate === endDate) return formatDateUTC(startDate);

  const result = `${formatDateUTC(startDate)} – ${formatDateUTC(endDate)}`;
  return result;
}

export function getShareUrl(shareId: string) {
  return `${window.location.origin}/a-list/shared/${shareId}`;
}
