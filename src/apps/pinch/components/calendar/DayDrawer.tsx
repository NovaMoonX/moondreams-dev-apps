import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import PlannedMealView from '@apps/pinch/components/calendar/PlannedMealView';
import RepriceDayRow from '@apps/pinch/components/calendar/RepriceDayRow';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCostContext,
  selectIngredientsById,
  selectPeriodStats,
  selectPlannedByDay,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  Gap,
  MealType,
  PlannedMeal,
  ShoppingRequest,
} from '@apps/pinch/types';
import {
  formatDayTitle,
  getDateOfDayKey,
  getLocalTodayDate,
} from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  formatRowCost,
  getFixedNote,
  getItemTitle,
} from '@apps/pinch/utils/mealFormat';
import { getPlannedMealCost, getRepricedAt } from '@apps/pinch/utils/mealMath';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories } from '@apps/pinch/utils/stats';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

const NO_MEALS: PlannedMeal[] = [];

interface DayDrawerProps {
  uid: string;
  dayKey: string;
  /** Opens straight onto this planned meal, with the day's list one Back away. */
  initialMealId?: string | null;
  onClose: () => void;
  onAdd: (mealType: MealType | null) => void;
  onEdit: (plannedMealId: string, mealType: MealType) => void;
  onFillIn: (gaps: Gap[]) => void;
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
  onFillIn,
  onAddToShopping,
}: DayDrawerProps) {
  const { openSubview } = usePinchOverlay();
  const mealsByDay = useAppSelector(selectPlannedByDay);
  const meals = mealsByDay.get(dayKey) ?? NO_MEALS;
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
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
  const isRepriced = fixedSnapshots.some(
    (snapshot) => getRepricedAt(snapshot) !== null,
  );
  const leftOutCount = countLeftOutIngredients(stats.leftOut);

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
              + Add to this day
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
          onFillIn={onFillIn}
          onAddToShopping={onAddToShopping}
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
                  value={
                    stats.mealsPriced === 0
                      ? isFrozen
                        ? isRepriced
                          ? 'Still no price'
                          : "Wasn't priced"
                        : 'No prices yet'
                      : formatCost(stats.spendCents)
                  }
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
                          with no price yet.
                        </p>
                        <p className='text-muted-foreground'>
                          {isFrozen
                            ? 'This day has passed, so a price you add now counts from today on.'
                            : "The cost goes up once they're priced."}
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
                <GapNudge
                  uid={uid}
                  gaps={stats.openLeftOut}
                  onFillIn={onFillIn}
                />
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
                                      {formatRowCost(
                                        itemCost?.cents,
                                        meal.snapshot !== null,
                                        getRepricedAt(meal.snapshot) !== null,
                                      )}
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
              <RepriceDayRow uid={uid} dayKey={dayKey} />
              {getDateOfDayKey(dayKey) >= getLocalTodayDate() && (
                <AddToShoppingRow
                  subtitle='Choose what you need for the day'
                  onClick={() =>
                    onAddToShopping({
                      kind: 'items',
                      items: meals.flatMap((meal) => meal.items),
                      label: formatDayTitle(dayKey),
                    })
                  }
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
