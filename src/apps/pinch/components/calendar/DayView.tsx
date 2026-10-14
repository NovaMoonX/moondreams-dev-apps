import { memo } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import MealRow from '@apps/pinch/components/calendar/MealRow';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { PlannedMeal } from '@apps/pinch/types';
import { getItemTitle } from '@apps/pinch/utils/mealFormat';

interface DayViewProps {
  meals: PlannedMeal[];
  onOpenMeal: (mealId: string) => void;
  onAdd: () => void;
}

/** One day's meals grouped in meal order, each a row that opens its plate. */
function DayView({ meals, onOpenMeal, onAdd }: DayViewProps) {
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);

  if (meals.length === 0) {
    return (
      <div className='bg-secondary/50 space-y-3 rounded-2xl p-4 text-center'>
        <p className='text-sm'>Nothing planned for this day yet.</p>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          rounded='full'
          onClick={onAdd}
        >
          Plan a meal
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      {MEAL_TYPES.map((type) => {
        const ofType = meals.filter((meal) => meal.mealType === type);
        return ofType.length === 0 ? null : (
          <section
            key={type}
            aria-label={MEAL_TYPE_LABELS[type]}
            className='space-y-1'
          >
            <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[type]}</span>{' '}
              {MEAL_TYPE_LABELS[type]}
            </h3>
            <ul className='divide-border divide-y'>
              {ofType.map((meal) => (
                <li key={meal.id}>
                  <MealRow
                    meal={meal}
                    title={meal.items
                      .map((item) =>
                        getItemTitle(item, recipesById, ingredientsById),
                      )
                      .join(', ')}
                    subtitle={
                      meal.items.length > 1
                        ? `${meal.items.length} items`
                        : null
                    }
                    onOpen={() => onOpenMeal(meal.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default memo(DayView);
