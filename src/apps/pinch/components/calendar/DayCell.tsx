import { useState } from 'react';

import { Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DayPeek from '@apps/pinch/components/calendar/DayPeek';
import MealChip from '@apps/pinch/components/calendar/MealChip';
import {
  MEAL_TYPE_COLORS,
  MEAL_TYPE_EMOJIS,
  MONTH_CELL_MEAL_ORDER,
} from '@apps/pinch/constants';
import type { PlannedMeal } from '@apps/pinch/types';

const MAX_PILLS = 3;
const MAX_CHIPS = 3;
const CELL_RANK = new Map(
  MONTH_CELL_MEAL_ORDER.map((mealType, index) => [mealType, index]),
);

interface DayCellProps {
  date: Date;
  dayKey: string;
  meals: PlannedMeal[];
  isSelected: boolean;
  isToday: boolean;
  isOutsideMonth: boolean;
  /** The hover card is for a computer; a phone's cell is just the face, with no popover built behind it. */
  hasPeek: boolean;
  /** A wide screen's cell is tall enough for a pill per meal that names its first item; narrower screens show an emoji chip. */
  getMealTitle: ((meal: PlannedMeal) => string) | null;
  /** Controlled by the calendar so only one day's peek is ever open. */
  isPeekOpen: boolean;
  onPeekOpenChange: (isOpen: boolean) => void;
}

function getPopoverAlignment(date: Date) {
  if (date.getDay() === 0) return 'start';
  if (date.getDay() === 6) return 'end';
  return 'center';
}

/** One day of the month grid: its number and its meals, dinner first, a titled pill each on a wide screen or an emoji chip on a small one, with "+N" for the rest. */
function DayCell({
  date,
  dayKey,
  meals,
  isSelected,
  isToday,
  isOutsideMonth,
  hasPeek,
  getMealTitle,
  isPeekOpen,
  onPeekOpenChange,
}: DayCellProps) {
  const [hasPeeked, setHasPeeked] = useState(false);
  // Three rows is all a phone's cell holds at 320px, so a fourth meal turns the last chip into the count.
  const chipsShown = meals.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS;
  const shownCount = getMealTitle ? MAX_PILLS : chipsShown;
  const hiddenCount = Math.max(0, meals.length - shownCount);
  const cellMeals = [...meals].sort(
    (a, b) =>
      (CELL_RANK.get(a.mealType) ?? 0) - (CELL_RANK.get(b.mealType) ?? 0),
  );

  const face = (
    <span
      className={join(
        'relative flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg px-0.5 pt-1 pb-1 lg:px-1',
        isOutsideMonth && 'opacity-40',
      )}
    >
      <span
        className={join(
          'flex h-5 min-w-5 items-center justify-center self-start rounded-full px-1 text-[11px] font-semibold',
          isToday &&
            'bg-[var(--pinch-drizzle-fill)] text-[var(--pinch-drizzle-fill-foreground)]',
        )}
      >
        {date.getDate()}
      </span>
      {getMealTitle ? (
        cellMeals.slice(0, shownCount).map((meal) => (
          <span
            key={meal.id}
            className='flex h-5 min-w-0 items-center gap-1 rounded-md border-l-[3px] pr-1 pl-1'
            style={{
              backgroundColor: MEAL_TYPE_COLORS[meal.mealType].soft,
              borderLeftColor: MEAL_TYPE_COLORS[meal.mealType].solid,
            }}
          >
            <span
              className='w-3 shrink-0 text-center text-[10px] leading-none'
              aria-hidden='true'
            >
              {MEAL_TYPE_EMOJIS[meal.mealType]}
            </span>
            <span className='min-w-0 flex-1 truncate text-left text-[11px] leading-4 font-medium'>
              {getMealTitle(meal)}
            </span>
          </span>
        ))
      ) : (
        <span className='flex flex-wrap gap-0.5'>
          {cellMeals.slice(0, shownCount).map((meal) => (
            <MealChip
              key={meal.id}
              mealType={meal.mealType}
              className='size-[18px] text-[11px]'
            />
          ))}
          {hiddenCount > 0 && (
            <span className='text-muted-foreground grid h-[18px] min-w-[18px] place-items-center text-[10px] leading-none font-semibold'>
              +{hiddenCount}
            </span>
          )}
        </span>
      )}
      {getMealTitle && hiddenCount > 0 && (
        <span className='text-muted-foreground pl-1 text-left text-[10px] leading-none font-medium'>
          +{hiddenCount} more
        </span>
      )}
      {isSelected && (
        <span className='pointer-events-none absolute inset-0 rounded-lg ring-2 ring-[var(--pinch-drizzle)] ring-inset' />
      )}
    </span>
  );

  const label =
    meals.length === 0
      ? ''
      : `, ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'}`;

  return (
    <span
      aria-label={`${date.toDateString()}${label}`}
      className='absolute inset-0 block [&>div]:block [&>div]:h-full [&>div]:w-full'
    >
      {meals.length > 0 && hasPeek ? (
        <Popover
          hoverable
          isOpen={isPeekOpen}
          onOpenChange={(isOpen) => {
            if (isOpen) setHasPeeked(true);
            onPeekOpenChange(isOpen);
          }}
          placement='bottom'
          alignment={getPopoverAlignment(date)}
          className='w-64 p-3'
          trigger={face}
          offset={4}
        >
          {(isPeekOpen || hasPeeked) && (
            <DayPeek dayKey={dayKey} isToday={isToday} meals={meals} />
          )}
        </Popover>
      ) : (
        face
      )}
    </span>
  );
}

export default DayCell;
