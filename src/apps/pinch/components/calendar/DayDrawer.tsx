import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import PlannedMealView from '@apps/pinch/components/calendar/PlannedMealView';
import { isPlannedMealCooked } from '@apps/pinch/components/calendar/plannedMealOffer';
import RepriceDayRow from '@apps/pinch/components/calendar/RepriceDayRow';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCooksById,
  selectCostContext,
  selectIngredientsById,
  selectPeriodStats,
  selectPlannedByDay,
  selectRecipesById,
  selectShoppingItems,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  MealType,
  PlannedMeal,
  Recipe,
  ResolvedIngredient,
  ShoppingRequest,
} from '@apps/pinch/types';
import {
  formatDayTitle,
  getDateOfDayKey,
  getLocalTodayDate,
} from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import {
  formatCostTile,
  formatRowPrice,
  getFixedNote,
  getItemTitle,
  getPlannedMealTitle,
} from '@apps/pinch/utils/mealFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories } from '@apps/pinch/utils/stats';
import { formatServings } from '@apps/pinch/utils/recipeFormat';
import { getDayOnList, type DayOnList } from '@apps/pinch/utils/shopping';

const NO_MEALS: PlannedMeal[] = [];

const getShoppingRow = ({ isListed, coveredCount, rowCount }: DayOnList) => {
  if (isListed) {
    return { label: 'On your list ✓', subtitle: "Add anything that's missing" };
  }
  const label = 'Add to shopping list';
  if (coveredCount === 0) return { label, subtitle: '' };
  return {
    label,
    subtitle:
      coveredCount === rowCount
        ? 'Already on your list'
        : `${coveredCount} of ${rowCount} already on your list`,
  };
};

const getMealDetail = (
  meal: PlannedMeal,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
) => {
  const names = meal.items.map((item) =>
    getItemTitle(item, recipesById, ingredientsById),
  );
  if (meal.name?.trim()) return names.join(', ');
  if (names.length > 1) return `With ${names.slice(1).join(', ')}`;
  return meal.items[0] ? formatServings(meal.items[0].servings) : null;
};

interface DayDrawerProps {
  uid: string;
  dayKey: string;
  /** Opens straight onto this planned meal, with the day's list one Back away. */
  initialMealId?: string | null;
  onClose: () => void;
  onAdd: (mealType: MealType | null) => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
}

/** One day's meals grouped by type; picking one swaps the drawer to that meal, with a way back. */
function DayDrawer({
  uid,
  dayKey,
  initialMealId = null,
  onClose,
  onAdd,
  onEdit,
  onAddToShopping,
}: DayDrawerProps) {
  const { openSubview } = usePinchOverlay();
  const mealsByDay = useAppSelector(selectPlannedByDay);
  const meals = mealsByDay.get(dayKey) ?? NO_MEALS;
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const cooksById = useAppSelector(selectCooksById);
  const [pickedMealId, setPickedMealId] = useState<string | null>(
    initialMealId,
  );
  const plannedMealId = meals.some((meal) => meal.id === pickedMealId)
    ? pickedMealId
    : null;

  const stats = useAppSelector((state) =>
    selectPeriodStats(state, dayKey, dayKey),
  );
  const show = useAppSelector(selectShowNutrition);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const isFrozen = meals.length > 0 && meals.every((meal) => meal.snapshot);
  const fixedSnapshots = meals.flatMap((meal) => meal.snapshot ?? []);
  const leftOutCount = countLeftOutIngredients(stats.leftOut);
  const shoppingItems = useAppSelector(selectShoppingItems);
  const shoppingRow = useMemo(
    () =>
      getShoppingRow(
        getDayOnList(meals, shoppingItems, recipesById, ingredientsById),
      ),
    [meals, shoppingItems, recipesById, ingredientsById],
  );

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={formatDayTitle(dayKey)}
      footer={
        plannedMealId === null ? (
          <div className='px-4 pb-4'>
            <Button
              type='button'
              className='w-full'
              onClick={() => onAdd(null)}
            >
              Plan on this day
            </Button>
          </div>
        ) : (
          <div ref={setFooterEl} className='px-4 pb-4' />
        )
      }
    >
      {plannedMealId !== null ? (
        <PlannedMealView
          uid={uid}
          plannedMealId={plannedMealId}
          onBack={() => setPickedMealId(null)}
          onEdit={onEdit}
          onStartCooking={(recipeId, servings) => {
            onClose();
            openSubview({
              kind: 'cook',
              recipeId,
              servings,
              plannedMealId,
            });
          }}
          footerEl={footerEl}
        />
      ) : (
        <div className='space-y-5'>
          {meals.length === 0 ? (
            <p className='text-muted-foreground py-2 text-center text-sm'>
              Nothing planned for this day yet.
            </p>
          ) : (
            <>
              <div className='space-y-3'>
                <StatTile
                  label='Cost'
                  value={formatCostTile(
                    stats.mealsPriced === 0 ? null : stats.spendCents,
                    leftOutCount,
                    isFrozen,
                  )}
                  detail={isFrozen ? getFixedNote(fixedSnapshots) : undefined}
                  help={
                    leftOutCount > 0 && stats.mealsPriced > 0 ? (
                      <HelpTip
                        variant='warning'
                        title="What's left out"
                        placement='top'
                      >
                        <p>
                          Leaves out {leftOutCount}{' '}
                          {leftOutCount === 1 ? 'ingredient' : 'ingredients'}{' '}
                          {isFrozen
                            ? 'that had no price when the day passed. A price you add now counts from today on.'
                            : "with no price yet. The cost goes up once they're priced."}
                        </p>
                      </HelpTip>
                    ) : undefined
                  }
                />
                {hasShownValue(stats.dailyNutrition, show) && (
                  <div className='space-y-1.5'>
                    <p className='text-muted-foreground text-xs font-medium'>
                      For the day
                    </p>
                    <MacroStats
                      variant='tiles'
                      values={withWholeCalories(stats.dailyNutrition)}
                      show={show}
                    />
                  </div>
                )}
              </div>
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
                        const mealCost = getPlannedMealCost(meal, costContext);
                        const title = getPlannedMealTitle(
                          meal,
                          recipesById,
                          ingredientsById,
                        );
                        const detail = getMealDetail(
                          meal,
                          recipesById,
                          ingredientsById,
                        );
                        const isCooked = isPlannedMealCooked(
                          meal,
                          Array.from(
                            new Set(
                              meal.items.flatMap((item) =>
                                item.kind === 'RECIPE' &&
                                recipesById.has(item.refId)
                                  ? [item.refId]
                                  : [],
                              ),
                            ),
                          ),
                          cooksById,
                        );
                        return (
                          <li key={meal.id}>
                            <Button
                              type='button'
                              variant='tertiary'
                              aria-label={`Open ${MEAL_TYPE_LABELS[type].toLowerCase()}: ${title}${isCooked ? ', cooked' : ''}`}
                              onClick={() => setPickedMealId(meal.id)}
                              className='h-auto min-h-11 w-full items-start justify-start gap-3 px-0! py-2 text-left font-normal'
                            >
                              <span className='min-w-0 flex-1'>
                                <span className='text-foreground block wrap-break-word whitespace-normal'>
                                  {title}
                                  {isCooked && (
                                    <span aria-hidden='true'>{'\u00a0✅'}</span>
                                  )}
                                </span>
                                {detail && (
                                  <span className='text-muted-foreground block text-xs whitespace-normal'>
                                    {detail}
                                  </span>
                                )}
                              </span>
                              <span className='text-muted-foreground mt-0.5 shrink-0 text-sm whitespace-nowrap'>
                                {formatRowPrice(
                                  mealCost.totalCents,
                                  mealCost.leftOut.length > 0,
                                )}
                              </span>
                              <ChevronRight
                                className='text-muted-foreground mt-0.5 -ml-1 h-5 w-5 shrink-0'
                                aria-hidden='true'
                              />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              <RepriceDayRow uid={uid} dayKey={dayKey} />
              {getDateOfDayKey(dayKey) >= getLocalTodayDate() && (
                <AddToShoppingRow
                  label={shoppingRow.label}
                  subtitle={shoppingRow.subtitle}
                  onClick={() => onAddToShopping({ kind: 'day', dayKey })}
                />
              )}
            </>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default DayDrawer;
