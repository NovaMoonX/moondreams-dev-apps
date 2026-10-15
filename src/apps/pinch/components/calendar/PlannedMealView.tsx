import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { BookmarkPlus, ChevronLeft, CookingPot } from 'lucide-react';

import { useBackStep } from '@/hooks/useBackHistory';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ActionChips, { type ActionChip } from '@/components/ActionChips';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import PlannedCookRow from '@apps/pinch/components/calendar/PlannedCookRow';
import { getPlannedMealOffer } from '@apps/pinch/components/calendar/plannedMealOffer';
import { EatFromStockView } from '@apps/pinch/components/containers/EatFromStock';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_PLACES,
  MAX_NAME_LENGTH,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
} from '@apps/pinch/constants';
import { savePlannedAsMeal } from '@apps/pinch/store/actions/mealActions';
import { removePlannedMeal } from '@apps/pinch/store/actions/plannedMealActions';
import { useMealContainers } from '@apps/pinch/hooks/useEatFromStockPlaces';
import {
  selectCooksById,
  selectCooksLoadError,
  selectCostContext,
  selectIngredientsById,
  selectMeals,
  selectPlannedMeals,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  ContainerPlace,
  MealType,
  PlateCookRecipe,
} from '@apps/pinch/types';
import { formatDayTitle, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import {
  getMarkableRecipes,
  getPlateCookRecipes,
} from '@apps/pinch/utils/cooks';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import {
  formatCostTile,
  formatRowPrice,
  getFixedNote,
  getItemTitle,
  getPlannedMealTitle,
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
  /** Every recipe on the plate still to cook, cooked together in one session. */
  onStartCooking: (plate: PlateCookRecipe[]) => void;
  /** Where the drawer's pinned footer is: this view puts its actions there, a quiet Modify on the left and the one primary on the right. */
  footerEl: HTMLElement | null;
}

/** A planned meal inside the day drawer: its items, servings and cost, and the way to take it off the day. */
function PlannedMealView({
  uid,
  plannedMealId,
  onBack,
  onEdit,
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
  const cooksById = useAppSelector(selectCooksById);
  const savedMeals = useAppSelector(selectMeals);
  const [error, setError] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [mealName, setMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [eatingPlace, setEatingPlace] = useState<ContainerPlace | null>(null);
  const mealContainers = useMealContainers(meal ?? null);
  const now = useNow();
  useBackStep(true, onBack);
  useBackStep(isNaming, () => setIsNaming(false));

  if (!meal) {
    return null;
  }

  const recipeIds = Array.from(
    new Set(
      meal.items.flatMap((item) =>
        item.kind === 'RECIPE' && recipesById.has(item.refId)
          ? [item.refId]
          : [],
      ),
    ),
  );
  const offer = getPlannedMealOffer({
    meal,
    recipeIds,
    cookableRecipeIds: recipeIds.filter(
      (recipeId) => (recipesById.get(recipeId)?.steps.length ?? 0) > 0,
    ),
    cookIds: cooksById,
    containers: mealContainers,
    savedPlates: savedMeals.map((saved) => saved.items),
    now,
  });
  const { primary } = offer;
  const plate = getPlateCookRecipes(
    meal.items,
    recipesById,
    offer.cookRecipeIds,
  );
  const eatPlaces = CONTAINER_PLACES.map((place) => ({
    place,
    count: offer.eatFrom.filter((container) => container.place === place)
      .length,
  })).filter((entry) => entry.count > 0);
  const startCooking = () => onStartCooking(plate);
  const markable =
    offer.canMarkCooked && cooksLoadError === null
      ? getMarkableRecipes(meal.items, recipesById)
      : [];
  const markableByItemId = new Map(
    markable.flatMap((entry) => {
      const first = meal.items.find(
        (item) => item.kind === 'RECIPE' && item.refId === entry.recipe.id,
      );
      return first ? [[first.id, entry] as const] : [];
    }),
  );

  const cost = getPlannedMealCost(meal, costContext);
  const nutrition = getPlannedMealNutrition(
    meal,
    costContext.recipeNutrition,
    costContext.ingredientsById,
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
  const title = getPlannedMealTitle(meal, recipesById, ingredientsById);

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

  const actions: ActionChip[] = [
    plate.length > 0 &&
      primary?.kind !== 'COOK' && {
        key: 'cook',
        icon: <CookingPot className='h-4 w-4' />,
        label: 'Start cooking',
        description: 'Start cooking: steps one at a time, with a timer',
        onClick: startCooking,
      },
    ...eatPlaces
      .filter(
        ({ place }) => !(primary?.kind === 'EAT' && primary.place === place),
      )
      .map(({ place, count }) => ({
        key: `eat-${place}`,
        icon: (
          <span className='text-base leading-none'>
            {CONTAINER_PLACE_EMOJIS[place]}
          </span>
        ),
        label: `Eat from ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`,
        description: `Eat from your ${CONTAINER_PLACE_LABELS[place].toLowerCase()}: ${count} ${count === 1 ? 'container matches' : 'containers match'} this meal`,
        onClick: () => setEatingPlace(place),
      })),
    offer.canSaveAsMeal && {
      key: 'save',
      icon: <BookmarkPlus className='h-4 w-4' />,
      label: 'Save as a meal',
      description: 'Save as a meal: keep this plate to plan again',
      onClick: () => setIsNaming(true),
    },
  ].filter((action) => action !== false);

  const getPrimaryButton = () => {
    if (primary === null) return null;
    if (primary.kind === 'COOK') {
      return { label: 'Start cooking', onClick: startCooking };
    }
    const placeLabel = CONTAINER_PLACE_LABELS[primary.place].toLowerCase();
    return {
      label: `Eat from ${placeLabel}`,
      onClick: () => setEatingPlace(primary.place),
    };
  };
  const primaryButton = getPrimaryButton();
  const canModify = !meal.snapshot;

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
        ) : primaryButton || canModify ? (
          <div className='flex gap-2'>
            {canModify && (
              <Button
                type='button'
                variant={primaryButton ? 'secondary' : 'primary'}
                className={join(!primaryButton && 'flex-1')}
                onClick={() => onEdit(meal.id, meal.mealType)}
              >
                Modify
              </Button>
            )}
            {primaryButton && (
              <Button
                type='button'
                className='flex-1'
                onClick={primaryButton.onClick}
              >
                {primaryButton.label}
              </Button>
            )}
          </div>
        ) : null,
        footerEl,
      )
    : null;

  if (eatingPlace !== null) {
    return (
      <EatFromStockView
        uid={uid}
        meal={meal}
        place={eatingPlace}
        containers={offer.eatFrom}
        onBack={() => setEatingPlace(null)}
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
      <div className='space-y-3'>
        <p className='font-medium wrap-break-word'>
          <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[meal.mealType]}</span>{' '}
          {MEAL_TYPE_LABELS[meal.mealType]}
          {title && ` · ${title}`}
        </p>
        <ActionChips label='Meal actions' actions={actions} />
      </div>
      <div className='space-y-3'>
        <StatTile
          label='Cost'
          value={formatCostTile(
            cost.totalCents,
            leftOutCount,
            meal.snapshot !== null,
          )}
          detail={meal.snapshot ? getFixedNote([meal.snapshot]) : undefined}
          help={
            leftOutCount > 0 && cost.totalCents !== null ? (
              <HelpTip
                variant='warning'
                title="What's left out"
                placement='top'
              >
                <p>
                  Leaves out {leftOutCount}{' '}
                  {leftOutCount === 1 ? 'ingredient' : 'ingredients'}{' '}
                  {meal.snapshot
                    ? 'that had no price when the day passed. A price you add now counts from today on.'
                    : "with no price yet. The cost goes up once they're priced."}
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
      </div>
      <ul className='divide-border divide-y'>
        {meal.items.map((item) => {
          const itemCost = cost.items.get(item.id);
          const markEntry = markableByItemId.get(item.id);
          return (
            <li key={item.id} className='flex items-start gap-3 py-2.5'>
              <div className='min-w-0 flex-1'>
                <span className='block'>
                  {getItemTitle(item, recipesById, ingredientsById)}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {formatServings(item.servings)}
                </span>
                {markEntry && (
                  <PlannedCookRow
                    uid={uid}
                    plannedMealId={meal.id}
                    plannedDate={meal.date}
                    markable={markEntry}
                  />
                )}
              </div>
              <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                <span aria-hidden={itemCost?.cents == null}>
                  {formatRowPrice(
                    itemCost?.cents,
                    (itemCost?.gaps.length ?? 0) > 0,
                  )}
                </span>
                {itemCost?.cents == null && (
                  <span className='sr-only'>No price</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className='text-destructive text-sm'>{error}</p>}
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
