import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { useAppSelector } from '@/store';
import PlannedMealView from '@apps/pinch/components/calendar/PlannedMealView';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import {
  selectCostContext,
  selectIngredientsById,
  selectPlannedByDay,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { MealType, PlannedMeal } from '@apps/pinch/types';
import { formatDayTitle } from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const NO_MEALS: PlannedMeal[] = [];

interface DayDrawerProps {
  uid: string;
  dayKey: string;
  onClose: () => void;
  onAdd: (mealType: MealType | null) => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
}

/** One day's meals grouped by type; picking one swaps the drawer to that meal, with a way back. */
function DayDrawer({ uid, dayKey, onClose, onAdd, onEdit }: DayDrawerProps) {
  const meals = useAppSelector(selectPlannedByDay).get(dayKey) ?? NO_MEALS;
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [plannedMealId, setPlannedMealId] = useState<string | null>(null);

  const dayCost = getMealCost(
    meals.flatMap((meal) => meal.items),
    costContext,
  );
  const leftOutCount = countLeftOutIngredients(dayCost.leftOut);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={formatDayTitle(dayKey)}
      footer={
        plannedMealId === null && (
          <div className='px-4 pb-4'>
            <Button
              type='button'
              className='w-full'
              onClick={() => onAdd(null)}
            >
              + Add to this day
            </Button>
          </div>
        )
      }
    >
      {plannedMealId !== null ? (
        <PlannedMealView
          uid={uid}
          plannedMealId={plannedMealId}
          onBack={() => setPlannedMealId(null)}
          onEdit={onEdit}
        />
      ) : (
        <div className='space-y-5'>
          {meals.length === 0 ? (
            <p className='text-muted-foreground py-2 text-center text-sm'>
              Nothing planned for this day yet.
            </p>
          ) : (
            <>
              <p className='text-sm'>
                <span className='font-medium'>
                  {dayCost.totalCents === null
                    ? 'No prices yet'
                    : formatCost(dayCost.totalCents)}
                </span>
                {leftOutCount > 0 && dayCost.totalCents !== null && (
                  <span className='text-muted-foreground'>
                    {' '}
                    · {formatLeftOut(dayCost.leftOut)}
                  </span>
                )}
              </p>
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
                      {ofType.map((meal) => {
                        const mealCost = getMealCost(meal.items, costContext);
                        return (
                          <li key={meal.id}>
                            <Button
                              type='button'
                              variant='tertiary'
                              aria-label={`Open ${MEAL_TYPE_LABELS[type].toLowerCase()}`}
                              onClick={() => setPlannedMealId(meal.id)}
                              className='h-auto w-full flex-col items-stretch gap-0 px-0! py-1 text-left font-normal'
                            >
                              {meal.items.map((item) => {
                                const itemCost = mealCost.items.get(item.id);
                                return (
                                  <span
                                    key={item.id}
                                    className='flex items-center gap-3 py-1.5'
                                  >
                                    <ItemIcon
                                      kind={item.kind}
                                      iconKey={
                                        item.kind === 'INGREDIENT'
                                          ? (ingredientsById.get(item.refId)
                                              ?.iconKey ?? null)
                                          : null
                                      }
                                      size={24}
                                    />
                                    <span className='min-w-0 flex-1'>
                                      <span className='text-foreground block truncate'>
                                        {getItemTitle(
                                          item,
                                          recipesById,
                                          ingredientsById,
                                        )}
                                      </span>
                                      <span className='text-muted-foreground block text-xs'>
                                        {formatServings(item.servings)}
                                      </span>
                                    </span>
                                    <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                                      {itemCost?.cents == null
                                        ? ''
                                        : formatCost(itemCost.cents)}
                                    </span>
                                  </span>
                                );
                              })}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default DayDrawer;
