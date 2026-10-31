import { getLocalDayIndex } from '@/utils/dateRangeUtils';
import type { ChecklistItem } from '@apps/waypoint/types';

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** "Alex R." from a display name; null for a blank name or an email-shaped one. */
export function getShortName(
  displayName: string | null | undefined,
): string | null {
  const name = displayName?.trim() ?? '';
  if (name === '' || name.includes('@')) {
    return null;
  }
  const [first, ...rest] = name.split(/\s+/);
  const surname = rest
    .reverse()
    .find((word) => /^\p{L}/u.test(word) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(word));
  return surname ? `${first} ${Array.from(surname)[0].toLocaleUpperCase()}.` : first;
}

export interface DueInfo {
  isOverdue: boolean;
  /** "today", "tomorrow", "Fri", "Oct 12" or "2 days ago"; reads after "Due" or "first due". */
  when: string;
  /** "Due today", "Due Fri", "Overdue 2 days". */
  label: string;
}

/** A due day is an offset from the trip's UTC-midnight start; today is the viewer's local calendar day. */
export function getDueInfo(
  tripStartDate: number,
  dueDayIndex: number | null,
  now: number,
): DueInfo | null {
  if (dueDayIndex === null) {
    return null;
  }
  const daysAway = dueDayIndex - getLocalDayIndex(tripStartDate, now);
  if (daysAway < 0) {
    return {
      isOverdue: true,
      when: `${plural(-daysAway, 'day')} ago`,
      label: `Overdue ${plural(-daysAway, 'day')}`,
    };
  }
  const dueMs = tripStartDate + dueDayIndex * 86_400_000;
  const when =
    daysAway === 0
      ? 'today'
      : daysAway === 1
        ? 'tomorrow'
        : daysAway < 7
          ? weekdayFormatter.format(dueMs)
          : dateFormatter.format(dueMs);
  return { isOverdue: false, when, label: `Due ${when}` };
}

/** An item with nobody picked belongs to the whole group: one person ticking it finishes it. */
const isAnyoneItem = (item: ChecklistItem) => item.assignedToUids.length === 0;

/** "You", "Alex R.", "You + 2", "Alex R. + 1" or "Anyone". */
export function getWhoLabel(
  item: ChecklistItem,
  uid: string,
  isPrivate: boolean,
  getName: (uid: string) => string | null,
) {
  if (isPrivate) {
    return 'You';
  }
  if (isAnyoneItem(item)) {
    return 'Anyone';
  }
  const others = item.assignedToUids.filter((assigned) => assigned !== uid);
  if (others.length < item.assignedToUids.length) {
    return others.length === 0 ? 'You' : `You + ${others.length}`;
  }
  const first = getName(others[0]) ?? 'Trip member';
  return others.length === 1 ? first : `${first} + ${others.length - 1}`;
}

/** The one personal line for the section and the Overview card, so they never disagree. Counts the
 * viewer's open items: picked for them, their private ones, and Anyone items. */
export function getChecklistSummary(
  items: ChecklistItem[],
  uid: string,
  tripStartDate: number,
  now: number,
  isPrivate: (item: ChecklistItem) => boolean,
): string {
  const mine = items.filter(
    (item) =>
      !item.isCompleted &&
      (isPrivate(item) ||
        isAnyoneItem(item) ||
        item.assignedToUids.includes(uid)),
  );
  if (mine.length === 0) {
    return "You're all set";
  }
  const dated = mine
    .flatMap((item) =>
      item.completeByDayIndex === null ? [] : [item.completeByDayIndex],
    )
    .sort((a, b) => a - b)
    .map((dayIndex) => getDueInfo(tripStartDate, dayIndex, now));
  const overdue = dated.filter((due) => due?.isOverdue).length;
  const head = `You have ${plural(mine.length, 'thing')} to do`;
  if (overdue > 0) {
    return `${head} · ${overdue} overdue`;
  }
  return dated[0] ? `${head} · first due ${dated[0].when}` : head;
}
