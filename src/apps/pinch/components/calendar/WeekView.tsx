import { memo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  formatDayShort,
  formatDayTitle,
  getDateOfDayKey,
  getEarlierThisWeekKeys,
} from '@apps/pinch/utils/dayKeys';

const NO_MEALS: PlannedMeal[] = [];
const NO_KEYS: string[] = [];
const MAX_COLUMN_MEALS = 5;
const MAX_AGENDA_MEALS = 6;
// The day's own button stretched over its whole block, so a day with nothing in it opens from the line under its name too.
const EMPTY_DAY_DOOR = "after:absolute after:inset-0 after:content-['']";
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  timeZone: 'UTC',
});

interface WeekViewProps {
  startKey: string;
  todayKey: string;
  /** The agenda starts today, so this week's days already gone fold under one row above it. */
  hasEarlierDays: boolean;
  plannedByDay: Map<string, PlannedMeal[]>;
  getMealTitle: (meal: PlannedMeal) => string;
  /** Whether each meal row says what it costs. */
  showPrices: boolean;
  onOpenDay: (dayKey: string) => void;
  onOpenMeal: (dayKey: string, mealId: string) => void;
}

/** The seven days of a week: a vertical agenda on a phone, a column per day from `lg` up. */
function WeekView({
  startKey,
  todayKey,
  hasEarlierDays,
  plannedByDay,
  getMealTitle,
  showPrices,
  onOpenDay,
  onOpenMeal,
}: WeekViewProps) {
  const isWide = !useMediaQuery().isBelow('lg');
  const [isEarlierOpen, setIsEarlierOpen] = useState(false);
  const dayKeys = Array.from({ length: 7 }, (_, index) =>
    addDaysToKey(startKey, index),
  );

  if (isWide) {
    return (
      <div className='grid grid-cols-7 gap-1'>
        {dayKeys.map((dayKey) => {
          const meals = plannedByDay.get(dayKey) ?? NO_MEALS;
          const isToday = dayKey === todayKey;
          const isEmpty = meals.length === 0;
          return (
            <section
              key={dayKey}
              aria-label={formatDayTitle(dayKey)}
              className={join(
                'bg-muted flex min-h-64 min-w-0 flex-col gap-1 rounded-lg p-1.5',
                isEmpty && 'relative',
              )}
            >
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Open ${formatDayTitle(dayKey)}${isEmpty ? ', nothing planned' : ''}`}
                onClick={() => onOpenDay(dayKey)}
                className={join(
                  'h-auto min-h-0 flex-col gap-0.5 px-0! py-1 font-normal',
                  isEmpty && EMPTY_DAY_DOOR,
                )}
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
            </section>
          );
        })}
      </div>
    );
  }

  const tomorrowKey = addDaysToKey(todayKey, 1);
  const earlierKeys = hasEarlierDays
    ? getEarlierThisWeekKeys(todayKey)
    : NO_KEYS;
  const earlierSpan =
    earlierKeys.length === 0
      ? ''
      : `${formatDayShort(earlierKeys[0])}–${formatDayShort(earlierKeys[earlierKeys.length - 1])}`;
  const earlierCount = earlierKeys.reduce(
    (count, dayKey) => count + (plannedByDay.get(dayKey)?.length ?? 0),
    0,
  );

  const getDayLabel = (dayKey: string) => {
    if (dayKey === tomorrowKey) return 'Tomorrow';
    return formatDayTitle(dayKey);
  };

  const renderDay = (dayKey: string) => {
    const meals = plannedByDay.get(dayKey) ?? NO_MEALS;
    const isEmpty = meals.length === 0;
    return (
      <section
        key={dayKey}
        aria-label={formatDayTitle(dayKey)}
        className={join(isEmpty && 'relative')}
      >
        <SectionDivider
          label={
            <Button
              type='button'
              variant='tertiary'
              aria-label={`Open ${formatDayTitle(dayKey)}${isEmpty ? ', nothing planned' : ''}`}
              onClick={() => onOpenDay(dayKey)}
              className={join(
                'h-10 min-h-0 gap-1 px-2! py-0 text-sm font-medium',
                isEmpty && EMPTY_DAY_DOOR,
              )}
            >
              {dayKey === todayKey ? (
                <span className='rounded-full bg-[var(--pinch-drizzle-fill)] px-2.5 py-0.5 text-xs font-semibold text-[var(--pinch-drizzle-fill-foreground)]'>
                  Today
                </span>
              ) : (
                getDayLabel(dayKey)
              )}
              <ChevronRight
                className='text-muted-foreground h-3.5 w-3.5'
                aria-hidden='true'
              />
            </Button>
          }
        />
        {isEmpty ? (
          <p
            aria-hidden='true'
            className='text-muted-foreground pb-1 text-center text-sm'
          >
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
                  canBeCooked={dayKey <= todayKey}
                  isPast={dayKey < todayKey}
                  showPrice={showPrices}
                  onOpen={() => onOpenMeal(dayKey, meal.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {meals.length > MAX_AGENDA_MEALS && (
          <Button
            type='button'
            variant='tertiary'
            onClick={() => onOpenDay(dayKey)}
            className='h-10 w-full justify-between! px-0!'
          >
            <span>{meals.length - MAX_AGENDA_MEALS} more meals</span>
            <ChevronRight
              className='text-muted-foreground h-5 w-5'
              aria-hidden='true'
            />
          </Button>
        )}
      </section>
    );
  };

  return (
    <div className='space-y-3'>
      {earlierCount > 0 && (
        <Button
          type='button'
          variant='tertiary'
          aria-expanded={isEarlierOpen}
          onClick={() => setIsEarlierOpen((isOpen) => !isOpen)}
          className='h-auto min-h-10 w-full justify-between gap-3 px-0! py-1 text-left text-sm font-normal'
        >
          <span className='min-w-0 flex-1'>
            <span className='font-medium'>Earlier, {earlierSpan}</span>
            <span className='text-muted-foreground whitespace-nowrap'>
              {' '}
              · {earlierCount} {earlierCount === 1 ? 'meal' : 'meals'}
            </span>
          </span>
          <ChevronDown
            className={join(
              'text-muted-foreground h-4 w-4 shrink-0',
              isEarlierOpen && 'rotate-180',
            )}
            aria-hidden='true'
          />
        </Button>
      )}
      {isEarlierOpen && earlierKeys.map(renderDay)}
      {dayKeys.map(renderDay)}
    </div>
  );
}

export default memo(WeekView);
