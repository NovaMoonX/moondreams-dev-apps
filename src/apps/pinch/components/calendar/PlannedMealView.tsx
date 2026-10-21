import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft, ClipboardCopy } from 'lucide-react';

import CopyPanel from '@/components/CopyPanel';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import NutritionLine from '@apps/pinch/components/shared/NutritionLine';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
import {
  MAX_NAME_LENGTH,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
} from '@apps/pinch/constants';
import { savePlannedAsMeal } from '@apps/pinch/store/actions/mealActions';
import { removePlannedMeal } from '@apps/pinch/store/actions/plannedMealActions';
import {
  selectCostContext,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { MealType } from '@apps/pinch/types';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { mealMarkdown } from '@apps/pinch/utils/markdown/dayMarkdown';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { formatServings } from '@apps/pinch/utils/recipeFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';
import {
  getPlannedMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';

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
  const { addToast } = useToast();
  const meal = useAppSelector(selectPlannedMeals).find(
    (candidate) => candidate.id === plannedMealId,
  );
  const costContext = useAppSelector(selectCostContext);
  const show = useAppSelector(selectShowNutrition);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [error, setError] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [mealName, setMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  if (!meal) {
    return null;
  }

  const cost = getPlannedMealCost(meal, costContext);
  const nutrition = getPlannedMealNutrition(
    meal,
    costContext.recipeNutrition,
    costContext.ingredientsById,
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);

  const handleSaveAsMeal = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(
        savePlannedAsMeal({ uid, plannedMealId: meal.id, name: mealName }),
      ).unwrap();
      addToast({
        title: `Saved ${mealName.trim()} to your meals`,
        type: 'success',
      });
      setIsNaming(false);
      setMealName('');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this meal.'));
    } finally {
      setIsSaving(false);
    }
  };

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

  if (isCopying) {
    return (
      <CopyPanel
        text={mealMarkdown(
          `${MEAL_TYPE_LABELS[meal.mealType]} · ${formatDayTitle(getPlannedDayKey(meal.date))}`,
          meal.items,
          { recipesById, ingredientsById },
        )}
        note='The plate, with each recipe’s ingredients. No prices or stores.'
        onBack={() => setIsCopying(false)}
      />
    );
  }

  if (isNaming) {
    return (
      <div className='space-y-5'>
        <Button
          type='button'
          variant='tertiary'
          className='h-10 gap-1 px-0!'
          onClick={() => setIsNaming(false)}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          Back
        </Button>
        <div className='space-y-1.5'>
          <Label>Name this meal</Label>
          <Input
            variant='outline'
            autoFocus
            aria-label='Name for the saved meal'
            placeholder='Taco night'
            maxLength={MAX_NAME_LENGTH}
            value={mealName}
            onChange={(event) => setMealName(event.target.value)}
          />
          <p className='text-muted-foreground text-sm'>
            Saves these items so you can plan them again. This day stays as it
            is.
          </p>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <Button
          type='button'
          className='w-full'
          loading={isSaving}
          disabled={isSaving || mealName.trim() === ''}
          onClick={() => void handleSaveAsMeal()}
        >
          Save
        </Button>
      </div>
    );
  }

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
        {meal.snapshot && (
          <span className='text-muted-foreground block text-xs'>
            Prices as they were that day
          </span>
        )}
      </p>
      {hasShownValue(nutrition.values, show) && (
        <p className='text-muted-foreground text-sm'>
          <NutritionLine values={nutrition.values} show={show} /> for the plate
        </p>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
      {meal.snapshot ? (
        <p className='text-muted-foreground text-sm'>
          This day has passed, so its meals stay as they were. Remove one and
          add it again to change it.
        </p>
      ) : (
        <Button
          type='button'
          variant='secondary'
          className='h-11 w-full'
          onClick={() => onEdit(meal.id, meal.mealType)}
        >
          Change items or servings
        </Button>
      )}
      <Button
        type='button'
        variant='secondary'
        className='h-11 w-full'
        onClick={() => setIsNaming(true)}
      >
        Save as a meal
      </Button>
      <Button
        type='button'
        variant='secondary'
        className='h-11 w-full gap-2'
        onClick={() => setIsCopying(true)}
      >
        <ClipboardCopy className='h-4 w-4' aria-hidden='true' />
        Copy for a chat
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
