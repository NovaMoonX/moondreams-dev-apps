import { join } from '@moondreamsdev/dreamer-ui/utils';

import { HELM_COPY } from '@apps/helm/constants';
import { selectHabitWeek } from '@apps/helm/engine/habitDay';
import type { OpenHabit, OpenHabitDay } from '@apps/helm/types';
import { readWeekDays, type WeekCell } from '@apps/helm/utils/habitWeek';

interface HabitWeekProps {
  habit: OpenHabit;
  days: Record<string, OpenHabitDay>;
  clock: { now: number; dayKey: string; timeZone: string };
}

const CELL_STATE: Record<WeekCell, string> = {
  done: HELM_COPY.habitWeekDone,
  open: HELM_COPY.habitWeekOpen,
  later: HELM_COPY.habitWeekLater,
};

function Cell({ cell }: { cell: WeekCell }) {
  if (cell === 'later') {
    return (
      <span
        className='bg-muted-foreground/40 h-0.5 w-2.5 rounded-full'
        aria-hidden='true'
      />
    );
  }
  return (
    <span
      className={join(
        'size-2.5 rounded-full border-[1.5px]',
        cell === 'done'
          ? 'border-foreground bg-foreground'
          : 'border-muted-foreground/60',
      )}
      aria-hidden='true'
    />
  );
}

/** This week in the habit's own unit, Monday to today, and a seven-day row of what was marked. No streak, bar or percentage. */
function HabitWeek({ habit, days, clock }: HabitWeekProps) {
  const week = selectHabitWeek(
    { ...habit, status: 'active' },
    days,
    clock.dayKey,
  );
  const weekDays = readWeekDays(habit, days, clock);

  return (
    <section className='helm-card space-y-3 p-4'>
      <h2 className='text-muted-foreground text-[13px]'>
        {HELM_COPY.habitWeekTitle}
      </h2>
      <p className='helm-serif text-[24px] leading-[30px] tabular-nums'>
        {HELM_COPY.habitsWeekLine(week.done, week.due)}
      </p>
      <ul className='grid grid-cols-7 gap-1'>
        {weekDays.map((day) => {
          const name = HELM_COPY.habitWeekdaysLong[day.weekday];
          const state = day.isOff
            ? HELM_COPY.habitWeekOff
            : day.count !== null
              ? `${day.count}${day.isReached ? `, ${HELM_COPY.habitWeekReached}` : ''}`
              : day.cells.map((cell) => CELL_STATE[cell]).join(', ');
          return (
            <li
              key={day.key}
              className='flex flex-col items-center gap-1.5'
              aria-label={HELM_COPY.habitWeekDayLabel(name, state)}
            >
              <span
                className={join(
                  'text-[13px]',
                  day.key === clock.dayKey
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground',
                )}
                aria-hidden='true'
              >
                {name.charAt(0)}
              </span>
              <span
                className='flex min-h-5 flex-col items-center justify-center gap-1'
                aria-hidden='true'
              >
                {day.isOff ? null : day.count !== null ? (
                  <span
                    className={join(
                      'text-[13px] tabular-nums',
                      day.isReached
                        ? 'text-foreground font-bold'
                        : 'text-muted-foreground',
                    )}
                  >
                    {day.count}
                  </span>
                ) : (
                  day.cells.map((cell, index) => (
                    <Cell key={index} cell={cell} />
                  ))
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default HabitWeek;
