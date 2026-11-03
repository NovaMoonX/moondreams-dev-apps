import { join } from '@moondreamsdev/dreamer-ui/utils';

import { DAYS_CALENDAR_WORDS } from '@apps/runway/constants';
import type { CalendarEntry } from '@apps/runway/engine/dayCalendar';
import { Dot } from '@apps/runway/screens/days/CalendarDot';
import { getDotKind } from '@apps/runway/utils/calendarDots';

const MAX_DOTS = 3;

interface DaysCalendarCellProps {
  date: Date;
  entries: readonly CalendarEntry[];
  isSelected: boolean;
  isToday: boolean;
  isOutsideMonth: boolean;
}

/** One day of the month grid: its number and a dot for each kind of thing that falls on it, with "+N" past three. */
function DaysCalendarCell({
  date,
  entries,
  isSelected,
  isToday,
  isOutsideMonth,
}: DaysCalendarCellProps) {
  const shownCount = entries.length > MAX_DOTS ? MAX_DOTS - 1 : MAX_DOTS;
  const hiddenCount = Math.max(0, entries.length - shownCount);
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <span
      aria-label={DAYS_CALENDAR_WORDS.dayLabel(dateLabel, entries.length)}
      className='absolute inset-0 block'
    >
      <span
        className={join(
          'relative flex h-full w-full flex-col items-center gap-1 rounded-lg pt-1.5',
          isOutsideMonth && 'opacity-35',
        )}
      >
        <span
          className={join(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
            isToday && 'bg-primary text-primary-foreground',
          )}
        >
          {date.getDate()}
        </span>
        <span className='flex h-2.5 items-center justify-center gap-0.5'>
          {entries.slice(0, shownCount).map((entry, index) => (
            <Dot key={index} kind={getDotKind(entry)} />
          ))}
          {hiddenCount > 0 && (
            <span className='text-muted-foreground text-[10px] leading-none font-semibold'>
              {DAYS_CALENDAR_WORDS.more(hiddenCount)}
            </span>
          )}
        </span>
        {isSelected && !isToday && (
          <span className='ring-primary pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset' />
        )}
      </span>
    </span>
  );
}

export default DaysCalendarCell;
