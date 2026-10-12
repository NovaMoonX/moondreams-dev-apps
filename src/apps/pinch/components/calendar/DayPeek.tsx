import { useAppSelector } from '@/store';
import { MEAL_TYPE_EMOJIS, MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { PlannedMeal } from '@apps/pinch/types';
import { formatDayTitle } from '@apps/pinch/utils/dayKeys';
import { getItemTitle } from '@apps/pinch/utils/mealFormat';

const MAX_ROWS = 5;

interface DayPeekProps {
  dayKey: string;
  meals: PlannedMeal[];
}

/** What a day's hover card shows on a computer: each meal under its type with its items. */
function DayPeek({ dayKey, meals }: DayPeekProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);

  return (
    <div className='space-y-1 text-left'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {formatDayTitle(dayKey)}
      </p>
      {meals.slice(0, MAX_ROWS).map((meal) => (
        <div key={meal.id} className='py-1'>
          <p className='text-sm font-medium'>
            <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[meal.mealType]}</span>{' '}
            {MEAL_TYPE_LABELS[meal.mealType]}
          </p>
          <p className='text-muted-foreground text-xs'>
            {meal.items
              .map((item) => getItemTitle(item, recipesById, ingredientsById))
              .join(', ')}
          </p>
        </div>
      ))}
      {meals.length > MAX_ROWS && (
        <p className='text-muted-foreground pt-1 text-xs'>
          +{meals.length - MAX_ROWS} more
        </p>
      )}
    </div>
  );
}

export default DayPeek;
