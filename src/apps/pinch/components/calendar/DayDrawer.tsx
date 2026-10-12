import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ClipboardCopy } from 'lucide-react';

import CopyPanel from '@/components/CopyPanel';
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
import {
  dayMarkdown,
  weekMarkdown,
} from '@apps/pinch/utils/markdown/dayMarkdown';
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
  const mealsByDay = useAppSelector(selectPlannedByDay);
  const meals = mealsByDay.get(dayKey) ?? NO_MEALS;
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [pickedMealId, setPickedMealId] = useState<string | null>(null);
  const [copying, setCopying] = useState<'day' | 'week' | null>(null);
  const plannedMealId = meals.some((meal) => meal.id === pickedMealId)
    ? pickedMealId
    : null;

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
        plannedMealId === null &&
        copying === null && (
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
      {copying !== null ? (
        <CopyPanel
          text={
            copying === 'day'
              ? dayMarkdown(dayKey, meals, { recipesById, ingredientsById })
              : weekMarkdown(dayKey, mealsByDay, {
                  recipesById,
                  ingredientsById,
                })
          }
          note={
            copying === 'day'
              ? 'Each meal with its items and the recipes’ ingredients. No prices or stores.'
              : 'Monday to Sunday, each day in the same shape. No prices or stores.'
          }
          onBack={() => setCopying(null)}
        />
      ) : plannedMealId !== null ? (
        <PlannedMealView
          uid={uid}
          plannedMealId={plannedMealId}
          onBack={() => setPickedMealId(null)}
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
                              onClick={() => setPickedMealId(meal.id)}
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
          <div className='bg-muted/50 rounded-2xl p-1'>
            <Button
              type='button'
              variant='tertiary'
              className='h-11 w-full gap-2'
              onClick={() => setCopying('day')}
            >
              <ClipboardCopy className='h-4 w-4' aria-hidden='true' />
              Copy this day
            </Button>
            <Button
              type='button'
              variant='tertiary'
              className='h-11 w-full gap-2'
              onClick={() => setCopying('week')}
            >
              <ClipboardCopy className='h-4 w-4' aria-hidden='true' />
              Copy this week
            </Button>
          </div>
        </div>
      )}
    </DetailSheet>
  );
}

export default DayDrawer;
