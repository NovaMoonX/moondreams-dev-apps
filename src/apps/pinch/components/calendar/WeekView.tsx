import { memo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import MealRow from '@apps/pinch/components/calendar/MealRow';
import {
  MEAL_TYPE_COLORS,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
} from '@apps/pinch/constants';
import type { PlannedMeal } from '@apps/pinch/types';
import {
  addDaysToKey,
  formatDayTitle,
  getDateOfDayKey,
} from '@apps/pinch/utils/dayKeys';

const NO_MEALS: PlannedMeal[] = [];
const MAX_COLUMN_MEALS = 5;
const MAX_AGENDA_MEALS = 6;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});

interface WeekViewProps {
  startKey: string;
  todayKey: string;
  plannedByDay: Map<string, PlannedMeal[]>;
  getMealTitle: (meal: PlannedMeal) => string;
  onOpenDay: (dayKey: string) => void;
  onOpenMeal: (dayKey: string, mealId: string) => void;
  onAdd: (dayKey: string) => void;
}

/** The seven days of a week: a vertical agenda on a phone, a column per day from `lg` up. */
function WeekView({
  startKey,
  todayKey,
  plannedByDay,
  getMealTitle,
  onOpenDay,
  onOpenMeal,
  onAdd,
}: WeekViewProps) {
  const isWide = !useMediaQuery().isBelow('lg');
  const dayKeys = Array.from({ length: 7 }, (_, index) =>
    addDaysToKey(startKey, index),
  );

  if (isWide) {
    return (
      <div className='grid grid-cols-7 gap-1'>
        {dayKeys.map((dayKey) => {
          const meals = plannedByDay.get(dayKey) ?? NO_MEALS;
          const isToday = dayKey === todayKey;
          return (
            <section
              key={dayKey}
              aria-label={formatDayTitle(dayKey)}
              className='bg-muted flex min-h-64 min-w-0 flex-col gap-1 rounded-lg p-1.5'
            >
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Open ${formatDayTitle(dayKey)}`}
                onClick={() => onOpenDay(dayKey)}
                className='h-auto min-h-0 flex-col gap-0.5 px-0! py-1 font-normal'
              >
                <span className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                  {WEEKDAY_FORMATTER.format(getDateOfDayKey(dayKey))}
                </span>
                <span
                  className={join(
                    'flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                    isToday &&
                      'bg-[var(--pinch-drizzle-fill)] text-[var(--pinch-drizzle-fill-foreground)]',
                  )}
                >
                  {Number(dayKey.slice(8))}
                </span>
              </Button>
              {meals.slice(0, MAX_COLUMN_MEALS).map((meal) => (
                <Button
                  key={meal.id}
                  type='button'
                  variant='tertiary'
                  aria-label={`Open ${getMealTitle(meal)}`}
                  onClick={() => onOpenMeal(dayKey, meal.id)}
                  className='h-auto min-h-0 w-full items-start justify-start gap-1 rounded-md border-l-[3px] px-1.5! py-1 text-left font-normal'
                  style={{
                    backgroundColor: MEAL_TYPE_COLORS[meal.mealType].soft,
                    borderLeftColor: MEAL_TYPE_COLORS[meal.mealType].solid,
                  }}
                >
                  <span
                    className='shrink-0 text-[11px] leading-4'
                    aria-hidden='true'
                  >
                    {MEAL_TYPE_EMOJIS[meal.mealType]}
                  </span>
                  <span className='text-foreground line-clamp-2 min-w-0 flex-1 text-xs leading-4 font-medium break-words whitespace-normal'>
                    {getMealTitle(meal)}
                  </span>
                </Button>
              ))}
              {meals.length > MAX_COLUMN_MEALS && (
                <Button
                  type='button'
                  variant='tertiary'
                  onClick={() => onOpenDay(dayKey)}
                  className='text-muted-foreground! h-6 min-h-0 w-full px-1! text-[11px] font-medium'
                >
                  +{meals.length - MAX_COLUMN_MEALS} more
                </Button>
              )}
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Add to ${formatDayTitle(dayKey)}`}
                onClick={() => onAdd(dayKey)}
                className='text-muted-foreground! mt-auto h-8 min-h-0 w-full p-0'
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
              </Button>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {dayKeys.map((dayKey) => {
        const meals = plannedByDay.get(dayKey) ?? NO_MEALS;
        return (
          <section key={dayKey} aria-label={formatDayTitle(dayKey)}>
            <SectionDivider
              label={formatDayTitle(dayKey)}
              trailing={
                <>
                  {dayKey === todayKey && (
                    <span
                      className='size-2 rounded-full bg-[var(--pinch-drizzle-fill)]'
                      role='img'
                      aria-label='Today'
                    />
                  )}
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={`Add to ${formatDayTitle(dayKey)}`}
                    onClick={() => onAdd(dayKey)}
                    className='-mx-1 size-10'
                  >
                    <Plus className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </>
              }
            />
            {meals.length === 0 ? (
              <p className='text-muted-foreground pb-1 text-center text-sm'>
                Nothing planned
              </p>
            ) : (
              <ul className='divide-border divide-y'>
                {meals.slice(0, MAX_AGENDA_MEALS).map((meal) => (
                  <li key={meal.id}>
                    <MealRow
                      meal={meal}
                      title={getMealTitle(meal)}
                      subtitle={MEAL_TYPE_LABELS[meal.mealType]}
                      onOpen={() => onOpenMeal(dayKey, meal.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {meals.length > MAX_AGENDA_MEALS && (
              <Button
                type='button'
                variant='link'
                onClick={() => onOpenDay(dayKey)}
                className='h-10 px-0!'
              >
                Show {meals.length - MAX_AGENDA_MEALS} more
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default memo(WeekView);
