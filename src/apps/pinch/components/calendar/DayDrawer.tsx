import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChartColumn, ChevronLeft, ChevronRight } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import DetailSheet from '@/components/DetailSheet';
import GroupRow from '@/components/GroupRow';
import StatTile from '@/components/StatTile';
import TickMark from '@/components/TickMark';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import PeriodLeftOutHelp from '@apps/pinch/components/calendar/PeriodLeftOutHelp';
import PlannedMealView from '@apps/pinch/components/calendar/PlannedMealView';
import {
  isPlannedMealCooked,
  PLANNED_MEAL_VIEW,
  type PlannedMealSubview,
} from '@apps/pinch/components/calendar/plannedMealOffer';
import RepriceDayRow from '@apps/pinch/components/calendar/RepriceDayRow';
import StatsTiles from '@apps/pinch/components/calendar/StatsTiles';
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
import {
  formatRowPrice,
  getFixedNote,
  getItemTitle,
  getPlannedMealTitle,
  getPlateTitle,
} from '@apps/pinch/utils/mealFormat';
import { getPlannedMealCost } from '@apps/pinch/utils/mealMath';
import { getDayStatsOffer, getPeriodTotal } from '@apps/pinch/utils/stats';
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
  const { namedCount } = getPlateTitle(names);
  if (namedCount < names.length) {
    return `With ${names.slice(namedCount).join(', ')}`;
  }
  return names.length === 1 ? formatServings(meal.items[0].servings) : null;
};

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

interface DayDrawerProps {
  uid: string;
  dayKey: string;
  todayKey: string;
  /** View options' "Show stats": the day's tiles sit under its title instead of behind a row. */
  isStatsShown: boolean;
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
  todayKey,
  isStatsShown,
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
  const [mealView, setMealView] =
    useState<PlannedMealSubview>(PLANNED_MEAL_VIEW);
  const plannedMealId = meals.some((meal) => meal.id === pickedMealId)
    ? pickedMealId
    : null;
  const stats = useAppSelector((state) =>
    selectPeriodStats(state, dayKey, dayKey),
  );
  const show = useAppSelector(selectShowNutrition);
  const statsOffer = isStatsShown ? null : getDayStatsOffer(stats, show);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const isStatsView =
    plannedMealId === null && isStatsOpen && statsOffer !== null;
  const getViewKey = () => {
    if (plannedMealId === null) return isStatsView ? 'stats' : 'day';
    return [
      plannedMealId,
      mealView.kind,
      mealView.kind === 'eat' ? mealView.place : '',
    ].join(':');
  };
  const viewKey = getViewKey();
  const mealRowNodes = useRef(new Map<string, HTMLButtonElement>());
  const statsRowNode = useRef<HTMLDivElement | null>(null);
  const statsViewNode = useRef<HTMLDivElement | null>(null);
  const openMeal = (id: string) => {
    setMealView(PLANNED_MEAL_VIEW);
    setPickedMealId(id);
  };
  const openStats = () => {
    setIsStatsOpen(true);
    window.requestAnimationFrame(() =>
      statsViewNode.current?.querySelector('button')?.focus(),
    );
  };
  const closeStats = () => {
    setIsStatsOpen(false);
    window.requestAnimationFrame(() =>
      statsRowNode.current?.querySelector('button')?.focus(),
    );
  };
  const backToDay = () => {
    setPickedMealId(null);
    window.requestAnimationFrame(() => {
      const row = plannedMealId
        ? mealRowNodes.current.get(plannedMealId)
        : null;
      if (row?.isConnected) row.focus();
    });
  };

  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const isFrozen = meals.length > 0 && meals.every((meal) => meal.snapshot);
  const fixedSnapshots = meals.flatMap((meal) => meal.snapshot ?? []);
  const isPast = dayKey < todayKey;
  const total = getPeriodTotal(stats, isPast);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const frozenNote = isFrozen ? getFixedNote(fixedSnapshots) : null;
  const shoppingItems = useAppSelector(selectShoppingItems);
  const shoppingRow = getShoppingRow(
    getDayOnList(meals, shoppingItems, recipesById, ingredientsById),
  );

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={formatDayTitle(dayKey)}
      viewKey={viewKey}
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
          view={mealView}
          onViewChange={setMealView}
          onBack={backToDay}
          onEdit={onEdit}
          onStartCooking={(plate) => {
            if (plate.length === 0) return;
            onClose();
            openSubview({
              kind: 'cook',
              recipeId: plate[0].recipeId,
              servings: plate[0].servings,
              plannedMealId,
              plate: plate.length > 1 ? plate : undefined,
            });
          }}
          footerEl={footerEl}
        />
      ) : isStatsView ? (
        <div ref={statsViewNode} className='space-y-5'>
          <div className='space-y-1'>
            <BackLink onBack={closeStats} />
            <h3 className='text-lg font-semibold [@media(max-height:500px)]:sr-only'>
              Stats for this day
            </h3>
          </div>
          <div className='space-y-3'>
            <StatsTiles stats={stats} todayKey={todayKey} day={{ isPast }} />
            {frozenNote && (
              <p className='text-muted-foreground text-xs'>{frozenNote}</p>
            )}
          </div>
        </div>
      ) : (
        <div className='space-y-5'>
          {meals.length === 0 ? (
            <p className='text-muted-foreground py-2 text-center text-sm'>
              Nothing planned for this day yet.
            </p>
          ) : (
            <>
              <div className='space-y-3'>
                {isStatsShown ? (
                  <StatsTiles
                    stats={stats}
                    todayKey={todayKey}
                    day={{ isPast }}
                  />
                ) : (
                  <StatTile
                    label={total.label}
                    value={total.value}
                    detail={frozenNote ?? undefined}
                    help={
                      isPartial ? (
                        <PeriodLeftOutHelp stats={stats} todayKey={todayKey} />
                      ) : undefined
                    }
                  />
                )}
                {isStatsShown && frozenNote && (
                  <p className='text-muted-foreground text-xs'>{frozenNote}</p>
                )}
                {statsOffer && (
                  <div ref={statsRowNode}>
                    <ActionGroup>
                      <GroupRow
                        icon={<ChartColumn className='h-4 w-4' />}
                        onClick={openStats}
                      >
                        <span className='block'>Stats for this day</span>
                        <span className='text-muted-foreground block text-xs'>
                          {statsOffer.subtitle}
                        </span>
                      </GroupRow>
                    </ActionGroup>
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
                              ref={(node) => {
                                if (node)
                                  mealRowNodes.current.set(meal.id, node);
                                return () => {
                                  mealRowNodes.current.delete(meal.id);
                                };
                              }}
                              type='button'
                              variant='tertiary'
                              aria-label={`Open ${MEAL_TYPE_LABELS[type].toLowerCase()}: ${title}${isCooked ? ', cooked' : ''}`}
                              onClick={() => openMeal(meal.id)}
                              className='h-auto min-h-11 w-full items-start justify-start gap-3 px-0! py-2 text-left font-normal'
                            >
                              <span className='min-w-0 flex-1'>
                                <span className='text-foreground block wrap-break-word whitespace-normal'>
                                  {title}
                                  {isCooked && (
                                    <>
                                      {'\u00a0'}
                                      <TickMark variant='soft' />
                                    </>
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
