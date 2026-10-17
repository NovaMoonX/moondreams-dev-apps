import {
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BookmarkPlus,
  ChevronLeft,
  CookingPot,
  Ellipsis,
  Trash2,
} from 'lucide-react';

import { useBackStep } from '@/hooks/useBackHistory';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSection from '@/components/FormSection';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import PlannedCookRow from '@apps/pinch/components/calendar/PlannedCookRow';
import {
  getPlannedMealOffer,
  PLANNED_MEAL_VIEW,
  type PlannedMealAction,
  type PlannedMealSubview,
} from '@apps/pinch/components/calendar/plannedMealOffer';
import { EatFromStockView } from '@apps/pinch/components/containers/EatFromStock';
import LeftOutTip from '@apps/pinch/components/shared/LeftOutTip';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  MAX_NAME_LENGTH,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  SECTION_COUNT_THRESHOLD,
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
  Gap,
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

interface BackLinkProps {
  onBack: () => void;
}

function BackLink({ onBack }: BackLinkProps) {
  useBackStep(true, onBack);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 px-0!'
      onClick={onBack}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      Back
    </Button>
  );
}

interface MoreRow {
  key: string;
  icon: ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
}

interface PlannedMealViewProps {
  uid: string;
  plannedMealId: string;
  view: PlannedMealSubview;
  onViewChange: Dispatch<SetStateAction<PlannedMealSubview>>;
  onBack: () => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
  /** Every recipe on the plate still to cook, cooked together in one session. */
  onStartCooking: (plate: PlateCookRecipe[]) => void;
  /** The drawer's pinned footer, which this view fills with its own actions. */
  footerEl: HTMLElement | null;
}

function PlannedMealView({
  uid,
  plannedMealId,
  view,
  onViewChange,
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
  const [mealName, setMealName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const moreViewRef = useRef<HTMLDivElement>(null);
  const mealContainers = useMealContainers(meal ?? null);
  const now = useNow();

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
  const isFrozen = meal.snapshot !== null;
  const mealLabel = (
    <>
      <span aria-hidden='true'>{MEAL_TYPE_EMOJIS[meal.mealType]}</span>{' '}
      {MEAL_TYPE_LABELS[meal.mealType]}
      {title && ` · ${title}`}
    </>
  );

  const showView = (next: PlannedMealSubview) => {
    setError(null);
    onViewChange(next);
  };
  const focusSoon = (getNode: () => HTMLElement | null | undefined) => {
    window.requestAnimationFrame(() => {
      const node = getNode();
      if (node?.isConnected) node.focus();
    });
  };
  const closeMore = () => {
    showView(PLANNED_MEAL_VIEW);
    focusSoon(() => moreRef.current);
  };
  const backToMore = (rowKey: string) => {
    showView({ kind: 'more' });
    focusSoon(() =>
      moreViewRef.current?.querySelector<HTMLElement>(
        `[data-more-row="${rowKey}"] button`,
      ),
    );
  };
  const backFromEat = (place: ContainerPlace, from: 'meal' | 'more') => {
    if (from === 'more') {
      backToMore(`eat-${place}`);
      return;
    }
    showView(PLANNED_MEAL_VIEW);
    focusSoon(() => primaryRef.current);
  };
  const eatFrom = (place: ContainerPlace) =>
    showView({
      kind: 'eat',
      place,
      from: view.kind === 'more' ? 'more' : 'meal',
    });

  const handleSaveAsMeal = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(
        savePlannedAsMeal({ uid, plannedMealId: meal.id, name: mealName }),
      ).unwrap();
      addToast({
        title: `Saved ${mealName.trim()} to Saved meals`,
        type: 'success',
      });
      setMealName('');
      onViewChange((current) =>
        current.kind === 'name' ? PLANNED_MEAL_VIEW : current,
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this meal.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (isRemoving) return;
    const confirmed = await confirm({
      title: 'Remove from this day',
      message: `Remove this ${MEAL_TYPE_LABELS[meal.mealType].toLowerCase()} from ${formatDayTitle(getPlannedDayKey(meal.date))}? Your recipes stay as they are.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsRemoving(true);
    try {
      await dispatch(removePlannedMeal({ uid, id: meal.id })).unwrap();
      onBack();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to remove this meal.'));
    } finally {
      setIsRemoving(false);
    }
  };

  const getMoreRow = (action: PlannedMealAction): MoreRow => {
    if (action.kind === 'COOK') {
      return {
        key: 'cook',
        icon: <CookingPot />,
        label: 'Start cooking',
        subtitle: 'Steps one at a time, with a timer',
        onClick: startCooking,
      };
    }
    if (action.kind === 'EAT') {
      return {
        key: `eat-${action.place}`,
        icon: CONTAINER_PLACE_EMOJIS[action.place],
        label: `Eat from ${CONTAINER_PLACE_LABELS[action.place].toLowerCase()}`,
        subtitle: `${action.count} ${action.count === 1 ? 'box matches' : 'boxes match'} this meal`,
        onClick: () => eatFrom(action.place),
      };
    }
    return {
      key: 'save',
      icon: <BookmarkPlus />,
      label: 'Save to Saved meals',
      subtitle: 'Keep this plate to plan again',
      onClick: () => showView({ kind: 'name' }),
    };
  };
  const moreRows = offer.more.map(getMoreRow);

  const getPrimaryButton = () => {
    if (primary === null) return null;
    if (primary.kind === 'COOK') {
      return { label: 'Start cooking', onClick: startCooking };
    }
    const placeLabel = CONTAINER_PLACE_LABELS[primary.place].toLowerCase();
    return {
      label: `Eat from ${placeLabel}`,
      onClick: () => eatFrom(primary.place),
    };
  };
  const primaryButton = getPrimaryButton();
  const canModify = !isFrozen;
  const isMoreOpen = view.kind === 'more';
  const isMoreAlone = !canModify && primaryButton === null;

  const getCostHelp = () => {
    if (leftOutCount === 0 || cost.totalCents === null) return undefined;
    if (isFrozen) {
      return (
        <HelpTip variant='warning' title="What's left out" placement='top'>
          <p>
            Leaves out {leftOutCount}{' '}
            {leftOutCount === 1 ? 'ingredient' : 'ingredients'} that had no
            price when the day passed. A price you add now counts from today on.
          </p>
        </HelpTip>
      );
    }
    const isOnPlate = (gap: Gap) =>
      meal.items.some(
        (item) => item.kind === 'INGREDIENT' && item.refId === gap.ingredientId,
      );
    const getFix = () => {
      const onPlate = cost.leftOut.filter(isOnPlate).length;
      if (onPlate === 0) return 'Add prices from the recipes on this plate.';
      if (onPlate === cost.leftOut.length) {
        return onPlate === 1
          ? 'Add its price in Kitchen.'
          : 'Add their prices in Kitchen.';
      }
      return 'Add prices from the recipes on this plate, or in Kitchen.';
    };
    return <LeftOutTip leftOut={cost.leftOut} fix={getFix()} />;
  };

  const getFooter = () => {
    if (view.kind === 'eat') return null;
    if (view.kind === 'name') {
      return (
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='secondary'
            onClick={() => backToMore('save')}
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
      );
    }
    return (
      <div className='flex gap-2'>
        {canModify && (
          <Button
            type='button'
            variant='secondary'
            className={join(
              'max-sm:px-3',
              primaryButton ? 'shrink-0' : 'min-w-0 flex-1',
            )}
            onClick={() => onEdit(meal.id, meal.mealType)}
          >
            Modify
          </Button>
        )}
        <Button
          ref={moreRef}
          type='button'
          variant='secondary'
          size={isMoreAlone ? undefined : 'icon'}
          aria-label='More for this meal'
          title='More for this meal'
          aria-expanded={isMoreOpen}
          onClick={() =>
            isMoreOpen ? closeMore() : showView({ kind: 'more' })
          }
          className={join(
            'text-foreground!',
            isMoreAlone ? 'flex-1 gap-2' : 'size-10 min-w-10 shrink-0 p-0',
            isMoreOpen && 'bg-accent!',
          )}
        >
          <Ellipsis className='h-5 w-5' aria-hidden='true' />
          {isMoreAlone && 'More'}
        </Button>
        {primaryButton && (
          <Button
            ref={primaryRef}
            type='button'
            className='min-w-0 flex-1 whitespace-nowrap max-sm:px-3'
            onClick={primaryButton.onClick}
          >
            {primaryButton.label}
          </Button>
        )}
      </div>
    );
  };
  const footerBody = getFooter();
  const footer =
    footerEl && footerBody ? createPortal(footerBody, footerEl) : null;

  const errorLine = error && (
    <p className='text-destructive text-sm' role='alert'>
      {error}
    </p>
  );

  const getViewBody = () => {
    if (view.kind === 'eat') {
      const { place, from } = view;
      return (
        <EatFromStockView
          uid={uid}
          meal={meal}
          place={place}
          containers={offer.eatFrom}
          footerEl={footerEl}
          onBack={() => backFromEat(place, from)}
          onDone={() =>
            onViewChange((current) =>
              current.kind === 'eat' ? PLANNED_MEAL_VIEW : current,
            )
          }
        />
      );
    }
    if (view.kind === 'name') {
      return (
        <div className='space-y-5'>
          <BackLink onBack={() => backToMore('save')} />
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
          {errorLine}
        </div>
      );
    }
    if (view.kind === 'more') {
      return (
        <div ref={moreViewRef} className='space-y-5'>
          <div className='space-y-1'>
            <BackLink onBack={closeMore} />
            <h3 className='text-lg font-semibold wrap-break-word'>
              {mealLabel}
            </h3>
          </div>
          <ActionGroup isRoomy caption='What would you like to do?'>
            {moreRows.map((row) => (
              <div key={row.key} data-more-row={row.key}>
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={row.icon}
                  label={row.label}
                  subtitle={row.subtitle}
                  onClick={row.onClick}
                />
              </div>
            ))}
          </ActionGroup>
          <div className='space-y-2'>
            <ActionRow
              isRoomy
              isDestructive
              icon={<Trash2 />}
              label='Remove from this day'
              subtitle='Your recipes stay as they are'
              isDisabled={isRemoving}
              onClick={() => void handleRemove()}
            />
            {errorLine}
          </div>
        </div>
      );
    }
    return null;
  };
  const viewBody = getViewBody();

  return (
    <>
      {viewBody}
      <div className={join('space-y-5', viewBody !== null && 'hidden')}>
        <div className='space-y-1'>
          <BackLink onBack={onBack} />
          <h3 className='text-lg font-semibold wrap-break-word'>{mealLabel}</h3>
        </div>
        <FormSection
          title='On the plate'
          detail={
            meal.items.length > SECTION_COUNT_THRESHOLD
              ? meal.items.length
              : undefined
          }
        >
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
        </FormSection>
        <div className='space-y-3'>
          <StatTile
            label='Cost'
            value={formatCostTile(cost.totalCents, leftOutCount, isFrozen)}
            detail={meal.snapshot ? getFixedNote([meal.snapshot]) : undefined}
            help={getCostHelp()}
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
      </div>
      {footer}
    </>
  );
}

export default PlannedMealView;
