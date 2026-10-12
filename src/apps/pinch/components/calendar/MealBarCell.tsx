import { Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DayPeek from '@apps/pinch/components/calendar/DayPeek';
import { MEAL_TYPE_EMOJIS } from '@apps/pinch/constants';
import type { PlannedMeal } from '@apps/pinch/types';

const MAX_BARS = 3;

interface MealBarCellProps {
  date: Date;
  dayKey: string;
  meals: PlannedMeal[];
  isSelected: boolean;
  isToday: boolean;
  isOutsideMonth: boolean;
  /** Controlled by the calendar so only one day's peek is ever open. */
  isPeekOpen: boolean;
  onPeekOpenChange: (isOpen: boolean) => void;
}

function getPopoverAlignment(date: Date) {
  if (date.getDay() === 0) return 'start';
  if (date.getDay() === 6) return 'end';
  return 'center';
}

/** One day: its number and a thin bar per planned meal in the meal type's colour, three at most and then "+N". */
function MealBarCell({
  date,
  dayKey,
  meals,
  isSelected,
  isToday,
  isOutsideMonth,
  isPeekOpen,
  onPeekOpenChange,
}: MealBarCellProps) {
  const face = (
    <span
      className={join(
        'relative flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg px-1 pt-1 pb-1',
        isOutsideMonth && 'opacity-40',
      )}
    >
      <span
        className={join(
          'flex h-5 min-w-5 items-center justify-center self-start rounded-full px-1 text-[11px] font-semibold',
          isToday && 'bg-[var(--pinch-drizzle)] text-white',
        )}
      >
        {date.getDate()}
      </span>
      {meals.slice(0, MAX_BARS).map((meal) => (
        <span key={meal.id} className='flex items-center gap-0.5'>
          <span
            className='w-3 shrink-0 text-center text-[9px] leading-none'
            aria-hidden='true'
          >
            {MEAL_TYPE_EMOJIS[meal.mealType]}
          </span>
          <span
            className='h-1.5 flex-1 rounded-full'
            style={{
              backgroundColor: `var(--pinch-meal-${meal.mealType.toLowerCase()})`,
            }}
          />
        </span>
      ))}
      {meals.length > MAX_BARS && (
        <span className='text-muted-foreground text-[10px] leading-none font-medium'>
          +{meals.length - MAX_BARS}
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
      {meals.length > 0 ? (
        <Popover
          hoverable
          isOpen={isPeekOpen}
          onOpenChange={onPeekOpenChange}
          placement='bottom'
          alignment={getPopoverAlignment(date)}
          className='w-64 p-3 max-sm:hidden!'
          trigger={face}
          offset={4}
        >
          <DayPeek dayKey={dayKey} meals={meals} />
        </Popover>
      ) : (
        face
      )}
    </span>
  );
}

export default MealBarCell;
