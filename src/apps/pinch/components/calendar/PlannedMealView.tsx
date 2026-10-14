import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ActionGroup from '@/components/ActionGroup';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import PlannedCookRow from '@apps/pinch/components/calendar/PlannedCookRow';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import NudgeCountNote from '@apps/pinch/components/shared/NudgeCountNote';
import StartCookingRow from '@apps/pinch/components/shared/StartCookingRow';
import {
  MAX_NAME_LENGTH,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
} from '@apps/pinch/constants';
import { savePlannedAsMeal } from '@apps/pinch/store/actions/mealActions';
import { removePlannedMeal } from '@apps/pinch/store/actions/plannedMealActions';
import {
  selectCooksLoadError,
  selectCostContext,
  selectIngredientsById,
  selectPlannedMeals,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap, MealType, ShoppingRequest } from '@apps/pinch/types';
import {
  formatDayTitle,
  getLocalTodayDate,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import { getMarkableRecipes } from '@apps/pinch/utils/cooks';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  formatRowCost,
  getItemTitle,
} from '@apps/pinch/utils/mealFormat';
import { formatServings } from '@apps/pinch/utils/recipeFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';
import { withWholeCalories } from '@apps/pinch/utils/stats';
import {
  getPlannedMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';

interface PlannedMealViewProps {
  uid: string;
  plannedMealId: string;
  onBack: () => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
  onFillIn: (gaps: Gap[]) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
  onStartCooking: (recipeId: string, servings: number) => void;
  /** Where the drawer's pinned footer is: this view puts its actions there, a quiet Modify on the left and the one primary on the right. */
  footerEl: HTMLElement | null;
}

/** A planned meal inside the day drawer: its items, servings and cost, and the way to take it off the day. */
function PlannedMealView({
  uid,
  plannedMealId,
  onBack,
  onEdit,
  onFillIn,
  onAddToShopping,
  onStartCooking,
  footerEl,
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
  const cooksLoadError = useAppSelector(selectCooksLoadError);
  const [error, setError] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [mealName, setMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isChoosing, setIsChoosing] = useState(false);

  if (!meal) {
    return null;
  }

  const cookable = meal.items.flatMap((item) => {
    const recipe =
      item.kind === 'RECIPE' ? recipesById.get(item.refId) : undefined;
    return recipe && recipe.steps.length > 0 ? [{ item, recipe }] : [];
  });

  const today = getLocalTodayDate();
  const canPlanAhead = meal.date >= today;
  const markable =
    meal.date <= today && cooksLoadError === null
      ? getMarkableRecipes(meal.items, recipesById)
      : [];

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

  const footer = footerEl
    ? createPortal(
        isNaming ? (
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setIsNaming(false)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              className='flex-1'
              loading={isSaving}
              disabled={isSaving || mealName.trim() === ''}
              onClick={() => void handleSaveAsMeal()}
            >
              Save
            </Button>
          </div>
        ) : (
          <div className='flex gap-2'>
            {!meal.snapshot && (
              <Button
                type='button'
                variant='secondary'
                onClick={() => onEdit(meal.id, meal.mealType)}
              >
                Modify
              </Button>
            )}
            <Button
              type='button'
              className='flex-1'
              onClick={() => setIsNaming(true)}
            >
              Save as a meal
            </Button>
          </div>
        ),
        footerEl,
      )
    : null;

  if (isChoosing && cookable.length > 1) {
    return (
      <div className='space-y-5'>
        <Button
          type='button'
          variant='tertiary'
          className='h-10 gap-1 px-0!'
          onClick={() => setIsChoosing(false)}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          Back
        </Button>
        <div className='space-y-1'>
          <p className='font-medium'>Which one are you cooking?</p>
          <p className='text-muted-foreground text-sm'>
            It opens with the servings you planned.
          </p>
        </div>
        <ul className='divide-border divide-y'>
          {cookable.map(({ item, recipe }) => (
            <li key={item.id}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-2.5 text-left'
                onClick={() => onStartCooking(recipe.id, item.servings)}
              >
                <span className='min-w-0 flex-1'>
                  <span className='block font-medium wrap-break-word'>
                    {recipe.title}
                  </span>
                  <span className='text-muted-foreground block text-xs font-normal'>
                    {formatServings(item.servings)}
                  </span>
                </span>
                <ChevronRight
                  className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      </div>
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
        {footer}
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
        {MEAL_TYPE_LABELS[meal.mealType]}
      </p>
      <div className='space-y-3'>
        <StatTile
          label='Cost'
          value={
            cost.totalCents === null
              ? meal.snapshot
                ? "Wasn't priced"
                : 'No prices yet'
              : formatCost(cost.totalCents)
          }
          detail={meal.snapshot ? 'Fixed when the day passed' : undefined}
          help={
            leftOutCount > 0 && cost.totalCents !== null ? (
              <HelpTip
                variant='warning'
                title="What's left out"
                placement='top'
              >
                <p>
                  Leaves out {leftOutCount}{' '}
                  {leftOutCount === 1 ? 'ingredient' : 'ingredients'} with no
                  price yet.
                </p>
                <NudgeCountNote
                  leftOut={cost.leftOut}
                  open={meal.snapshot ? [] : cost.leftOut}
                />
                <p className='text-muted-foreground'>
                  {meal.snapshot
                    ? 'This day has passed, so a price you add now counts from today on.'
                    : "The cost goes up once they're priced."}
                </p>
              </HelpTip>
            ) : undefined
          }
        />
        {hasShownValue(nutrition.values, show) && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs font-medium'>
              For the plate
            </p>
            <MacroStats
              variant='tiles'
              values={withWholeCalories(nutrition.values)}
              show={show}
            />
          </div>
        )}
        {!meal.snapshot && (
          <GapNudge uid={uid} gaps={cost.leftOut} onFillIn={onFillIn} />
        )}
      </div>
      <ul className='divide-border divide-y'>
        {meal.items.map((item) => {
          const itemCost = cost.items.get(item.id);
          return (
            <li key={item.id} className='flex items-start gap-3 py-2.5'>
              <span className='min-w-0 flex-1'>
                <span className='block'>
                  {getItemTitle(item, recipesById, ingredientsById)}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {formatServings(item.servings)}
                </span>
              </span>
              <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                {formatRowCost(itemCost?.cents, meal.snapshot !== null)}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      {meal.snapshot && (
        <p className='text-muted-foreground text-sm'>
          This day has passed, so its meals keep the prices and numbers they
          had. Remove one and add it again to use today's.
        </p>
      )}
      {(canPlanAhead || markable.length > 0) && (
        <ActionGroup>
          {canPlanAhead && cookable.length > 0 && (
            <StartCookingRow
              isGrouped
              onClick={() =>
                cookable.length === 1
                  ? onStartCooking(
                      cookable[0].recipe.id,
                      cookable[0].item.servings,
                    )
                  : setIsChoosing(true)
              }
            />
          )}
          {markable.map((entry) => (
            <PlannedCookRow
              key={entry.recipe.id}
              isGrouped
              uid={uid}
              plannedMealId={meal.id}
              plannedDate={meal.date}
              markable={entry}
            />
          ))}
          {canPlanAhead && (
            <AddToShoppingRow
              isGrouped
              subtitle='Choose what you need for this meal'
              onClick={() =>
                onAddToShopping({
                  kind: 'items',
                  items: meal.items,
                  label: `${MEAL_TYPE_LABELS[meal.mealType]} on ${formatDayTitle(getPlannedDayKey(meal.date))}`,
                })
              }
            />
          )}
        </ActionGroup>
      )}
      <Button
        type='button'
        variant='tertiary'
        className='text-destructive! h-10 w-full'
        onClick={() => void handleRemove()}
      >
        Remove from this day
      </Button>
      {footer}
    </div>
  );
}

export default PlannedMealView;
