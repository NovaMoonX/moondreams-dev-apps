import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
import { MEAL_TYPE_EMOJIS, MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import { removePlannedMeal } from '@apps/pinch/store/actions/plannedMealActions';
import {
  selectCostContext,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { MealType } from '@apps/pinch/types';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { formatServings } from '@apps/pinch/utils/recipeFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';

interface PlannedMealViewProps {
  uid: string;
  plannedMealId: string;
  onBack: () => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
}

/** A planned meal inside the day drawer: its items, servings and cost, and the way to take it off the day. */
function PlannedMealView({
  uid,
  plannedMealId,
  onBack,
  onEdit,
}: PlannedMealViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const meal = useAppSelector(selectPlannedMeals).find(
    (candidate) => candidate.id === plannedMealId,
  );
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [error, setError] = useState<string | null>(null);

  if (!meal) {
    return null;
  }

  const cost = getMealCost(meal.items, costContext);
  const leftOutCount = countLeftOutIngredients(cost.leftOut);

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove from this day',
      message: `Remove this ${MEAL_TYPE_LABELS[meal.mealType].toLowerCase()} from ${formatDayTitle(getPlannedDayKey(meal.date))}? Your recipes stay as they are.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(removePlannedMeal({ uid, id: meal.id })).unwrap();
      onBack();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to remove this meal.'));
    }
  };

  return (
    <div className='space-y-5'>
      <Button
        type='button'
        variant='tertiary'
        className='h-10 gap-1 px-0!'
        onClick={onBack}
      >
        <ChevronLeft className='h-4 w-4' aria-hidden='true' />
        Back
      </Button>
      <p className='font-medium'>
        <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[meal.mealType]}</span>{' '}
        {MEAL_TYPE_LABELS[meal.mealType]} ·{' '}
        {formatDayTitle(getPlannedDayKey(meal.date))}
      </p>
      <ul className='divide-border divide-y'>
        {meal.items.map((item) => {
          const itemCost = cost.items.get(item.id);
          return (
            <li key={item.id} className='flex items-start gap-3 py-2.5'>
              <ItemIcon
                kind={item.kind}
                iconKey={
                  item.kind === 'INGREDIENT'
                    ? (ingredientsById.get(item.refId)?.iconKey ?? null)
                    : null
                }
              />
              <span className='min-w-0 flex-1'>
                <span className='block'>
                  {getItemTitle(item, recipesById, ingredientsById)}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {formatServings(item.servings)}
                </span>
              </span>
              <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                {itemCost?.cents == null
                  ? 'No price'
                  : formatCost(itemCost.cents)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className='text-sm'>
        <span className='font-medium'>
          {cost.totalCents === null
            ? 'No prices yet'
            : formatCost(cost.totalCents)}
        </span>
        {leftOutCount > 0 && cost.totalCents !== null && (
          <span className='text-muted-foreground'>
            {' '}
            · {formatLeftOut(cost.leftOut)}
          </span>
        )}
      </p>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <Button
        type='button'
        variant='secondary'
        className='h-11 w-full'
        onClick={() => onEdit(meal.id, meal.mealType)}
      >
        Change items or servings
      </Button>
      <Button
        type='button'
        variant='tertiary'
        className='text-destructive! h-10 w-full'
        onClick={() => void handleRemove()}
      >
        Remove from this day
      </Button>
    </div>
  );
}

export default PlannedMealView;
