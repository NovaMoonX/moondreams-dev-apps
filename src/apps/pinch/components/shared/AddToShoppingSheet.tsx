import { useMemo, useState } from 'react';

import {
  Button,
  Calendar,
  Checkbox,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ListChecks, ListX } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
import SummaryRow from '@/components/SummaryRow';
import { useBackStep } from '@/hooks/useBackHistory';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  toDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_SHOPPING_LINES_PER_ADD,
  MEAL_TYPE_LABELS,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectHasPackages,
  selectMealsById,
  selectPackagesByIngredient,
  selectPlannedByDay,
  selectRecipesById,
  selectShoppingById,
  selectShoppingItems,
  selectShoppingLoadError,
  selectStockByMeal,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { MealItem, PlannedMeal, ShoppingRequest } from '@apps/pinch/types';
import {
  getShoppingStockLine,
  type StockedItem,
} from '@apps/pinch/utils/containers';
import { getLineStock, getLineStockText } from '@apps/pinch/utils/packages';
import {
  addDaysToKey,
  formatDayTitle,
  getCellDayKey,
  getMonthWindow,
  getPlannedDayKey,
  type DayRange,
} from '@apps/pinch/utils/dayKeys';
import {
  formatShopAmount,
  formatSourceDay,
  formatSourceNames,
  getMealShoppingSource,
  getOnListHint,
  getPlanInRange,
  getRecipeLines,
  getItemsByRow,
  getOpenItemsByRow,
  getRecipeShoppingSource,
  getRowOnList,
  getShopAmount,
  getShoppingItemId,
  getSourcedLines,
  groupShopLines,
  isUsuallyAtHome,
  parseShoppingSource,
  type ShopLineRow,
  type SourcedItems,
  type SourcedLine,
} from '@apps/pinch/utils/shopping';

const NO_MEALS: PlannedMeal[] = [];

const NEXT_DAYS = 7;

// The calendar's own selection is cleared: the cells draw the range this sheet holds, which can start preset.
const RANGE_STYLES = {
  containerClassName: 'h-auto!',
  cellClassName: 'p-0 hover:bg-transparent focus:bg-transparent',
  selectedCellClassName: 'bg-transparent! text-foreground!',
  rangeCellClassName: 'bg-transparent!',
  rangeStartCellClassName: 'bg-transparent! text-foreground!',
  rangeEndCellClassName: 'bg-transparent! text-foreground!',
  todayCellClassName: 'border-0',
};

const toCellDate = (dayKey: string) => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function SpanText({ startKey, endKey }: DayRange) {
  return startKey === endKey ? (
    <span className='whitespace-nowrap'>{formatDayTitle(startKey)}</span>
  ) : (
    <>
      <span className='whitespace-nowrap'>{formatDayTitle(startKey)} –</span>{' '}
      <span className='whitespace-nowrap'>{formatDayTitle(endKey)}</span>
    </>
  );
}

const formatMealCount = (count: number) => {
  if (count === 0) return 'Nothing planned';
  return count === 1 ? '1 meal' : `${count} meals`;
};

interface DraftRange {
  startKey: string;
  endKey: string;
}

interface ShoppingPickProps {
  uid: string;
  request: ShoppingRequest;
  onClose: () => void;
  /** The cap on the header and list together, so the sheet's own body never scrolls. */
  columnClassName?: string;
  /** False on the Shopping tab itself, where the toast has nowhere to take the person. */
  hasViewAction?: boolean;
}

/** What goes on the list from a recipe, a meal, a day or a range of planned days, each line remembering what put it there. A row starts unticked only once these same sources put it on the list, and ticked when something else did, adding only the share not yet there. */
export function ShoppingPick({
  uid,
  request,
  onClose,
  columnClassName = 'max-h-[max(22rem,calc(92dvh-22rem))]',
  hasViewAction = true,
}: ShoppingPickProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { showShoppingTab } = usePinchOverlay();
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const onList = useAppSelector(selectShoppingById);
  const listCount = useAppSelector(selectShoppingItems).length;
  const loadError = useAppSelector(selectShoppingLoadError);
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const stockByMeal = useAppSelector(selectStockByMeal);
  const hasPantry = useAppSelector(selectHasPackages);
  const packagesByIngredient = useAppSelector(selectPackagesByIngredient);
  const mealsById = useAppSelector(selectMealsById);
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const planWindowKey = useAppSelector(
    (state) => state.pinch.plannedMeals.windowKey,
  );
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const [todayKey] = useState(() => toLocalDateInputValue(Date.now()));
  const recipe =
    request.kind === 'recipe'
      ? (recipesById.get(request.recipeId) ?? null)
      : null;
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [days, setDays] = useState<DayRange>(() =>
    request.kind === 'range'
      ? { startKey: request.startKey, endKey: request.endKey }
      : { startKey: todayKey, endKey: addDaysToKey(todayKey, NEXT_DAYS - 1) },
  );
  const [draft, setDraft] = useState<DraftRange | null>(null);
  useBackStep(draft !== null, () => setDraft(null));
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const isCompact = useIsShortScreen();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRange = request.kind === 'range';
  const planWindow = planWindowKey ? getMonthWindow(planWindowKey) : null;
  const lastLoadedKey = planWindow
    ? addDaysToKey(toDateInputValue(planWindow.end), -1)
    : todayKey;
  const isPlanLoaded =
    planWindow !== null &&
    toDateInputValue(planWindow.start) <= todayKey &&
    todayKey <= lastLoadedKey;
  const span = useMemo(
    () =>
      getPlanInRange(
        plannedByDay,
        {
          startKey: days.startKey,
          endKey: days.endKey > lastLoadedKey ? lastLoadedKey : days.endKey,
        },
        todayKey,
      ),
    [plannedByDay, days, lastLoadedKey, todayKey],
  );

  const plannedMeals = useMemo((): PlannedMeal[] | null => {
    if (request.kind === 'day') {
      return plannedByDay.get(request.dayKey) ?? NO_MEALS;
    }
    if (request.kind === 'range') {
      return isPlanLoaded ? span.meals : NO_MEALS;
    }
    return null;
  }, [request, plannedByDay, span, isPlanLoaded]);
  const groups = useMemo((): SourcedItems[] | null => {
    if (request.kind === 'items') {
      return [
        {
          items: request.items,
          source: request.mealId ? getMealShoppingSource(request.mealId) : null,
        },
      ];
    }
    return (
      plannedMeals?.map((meal) => ({ items: meal.items, source: meal.id })) ??
      null
    );
  }, [request, plannedMeals]);
  const items = useMemo(
    (): MealItem[] | null => groups?.flatMap((group) => group.items) ?? null,
    [groups],
  );

  const rows = useMemo(() => {
    const lines: SourcedLine[] = groups
      ? getSourcedLines(groups, recipesById, ingredientsById)
      : recipe
        ? getRecipeLines(recipe, ingredientsById, servings).map((line) => ({
            ...line,
            source: getRecipeShoppingSource(recipe.id, servings),
          }))
        : [];
    return groupShopLines(lines, ingredientsById);
  }, [groups, recipe, recipesById, ingredientsById, servings]);
  const openByRow = useMemo(
    () => getOpenItemsByRow(rows, [...onList.values()]),
    [rows, onList],
  );
  const states = useMemo(() => {
    const itemsByRow = getItemsByRow(rows, [...onList.values()]);
    return new Map(
      rows.map((row) => {
        const rowItems = itemsByRow.get(row.id) ?? [];
        const open = openByRow.get(row.id) ?? [];
        return [
          row.id,
          {
            ...getRowOnList(row.lines, rowItems),
            openText:
              open.length > 0
                ? formatShopAmount(getShopAmount(open, row.section))
                : undefined,
          },
        ];
      }),
    );
  }, [onList, rows, openByRow]);
  const getState = (row: ShopLineRow) =>
    states.get(row.id) ?? {
      ...getRowOnList(row.lines, []),
      openText: undefined,
    };
  const nameSource = (source: string) => {
    const { kind, id } = parseShoppingSource(source);
    if (kind === 'recipe') return 'this recipe';
    const meal =
      kind === 'planned'
        ? plannedMeals?.find((planned) => planned.id === id)
        : undefined;
    return meal
      ? `${formatSourceDay(getPlannedDayKey(meal.date), todayKey)} ${MEAL_TYPE_LABELS[meal.mealType].toLowerCase()}`
      : 'this meal';
  };

  const isReady = isLoaded && loadError === null;
  const stocked = useMemo(() => {
    if (request.kind === 'recipe') {
      const summary = stockByRecipe.get(request.recipeId);
      return summary && recipe ? [{ name: recipe.title, summary }] : [];
    }
    const mealId = request.kind === 'items' ? request.mealId : null;
    const mealStock = mealId != null ? stockByMeal.get(mealId) : undefined;
    const mealName = mealId != null ? mealsById.get(mealId)?.name : undefined;
    const recipeIds = Array.from(
      new Set(
        (items ?? [])
          .filter((item) => item.kind === 'RECIPE')
          .map((item) => item.refId),
      ),
    );
    const entries: StockedItem[] = [
      ...(mealStock && mealName
        ? [{ name: mealName, summary: mealStock }]
        : []),
      ...recipeIds.flatMap((id) => {
        const summary = stockByRecipe.get(id);
        const name = recipesById.get(id)?.title;
        return summary && name ? [{ name, summary }] : [];
      }),
    ];
    return entries;
  }, [
    request,
    items,
    recipe,
    recipesById,
    mealsById,
    stockByRecipe,
    stockByMeal,
  ]);
  const stockLine = getShoppingStockLine(stocked, request.kind !== 'recipe');
  // What the pantry holds of a row's ingredient, measured against everything the row asks for; a package past its date or an amount that can't be compared never counts as enough.
  const getPantry = (row: ShopLineRow) => {
    if (!hasPantry) return null;

    const need = getShopAmount(row.lines, row.section);
    const ingredient = ingredientsById.get(row.ingredientId);
    return getLineStock(
      { amount: need?.amount ?? null, unit: need?.unit ?? 'EACH' },
      packagesByIngredient.get(row.ingredientId),
      undefined,
      {
        gramsPerMl: ingredient?.gramsPerMl ?? null,
        gramsEach: ingredient?.gramsEach ?? null,
      },
    );
  };
  const hasEnough = (row: ShopLineRow) => getPantry(row)?.kind === 'HAVE';
  const startsOn = (row: ShopLineRow) =>
    !getState(row).isCovered && !isUsuallyAtHome(row) && !hasEnough(row);
  const isTicked = (row: ShopLineRow) => choices[row.id] ?? startsOn(row);
  const selected = rows.filter(isTicked);
  const startsTicked = rows.some(startsOn);
  const getPantryHint = (row: ShopLineRow) => {
    const pantry = getPantry(row);
    if (pantry === null || pantry.kind === 'NONE' || pantry.kind === 'OTHER') {
      return null;
    }
    if (pantry.kind === 'HAVE') {
      return `${getLineStockText(pantry)} in your pantry. Tick to add it anyway.`;
    }
    return pantry.kind === 'PAST'
      ? 'What is in your pantry is past its date.'
      : `${getLineStockText(pantry)} in your pantry.`;
  };
  const atHomeRows = rows.filter(isUsuallyAtHome);
  const shownRows = [
    ...rows.filter((row) => !isUsuallyAtHome(row)),
    ...atHomeRows,
  ];
  const selectedLines = selected.flatMap((row) => getState(row).addLines);
  const selectedIds = [
    ...new Set(
      selectedLines.map((line) =>
        getShoppingItemId(line.ingredientId, line.unit),
      ),
    ),
  ];
  const newCount = selectedIds.filter((id) => !onList.has(id)).length;
  const isAllTicked = selected.length === rows.length;
  const getLabel = () => {
    if (request.kind === 'recipe') return recipe?.title ?? '';
    if (request.kind === 'day') return formatDayTitle(request.dayKey);
    return request.kind === 'items' ? request.label : '';
  };
  const label = getLabel();

  const getBlock = () => {
    if (loadError !== null) {
      return "Your list couldn't load, so adding is paused.";
    }
    if (!isLoaded) {
      return 'Loading your list…';
    }
    if (selected.length === 0) {
      return rows.length === 0
        ? 'There is nothing here to add.'
        : 'Tick at least one to add it.';
    }
    if (selectedIds.length > MAX_SHOPPING_LINES_PER_ADD) {
      return `Pick up to ${MAX_SHOPPING_LINES_PER_ADD} at a time.`;
    }
    if (listCount >= SOFT_MAX_SHOPPING_ITEMS && newCount > 0) {
      return "Your list is full. Take something off or clear what you've got in the Shopping tab.";
    }
    if (listCount + newCount > SOFT_MAX_SHOPPING_ITEMS) {
      return `Your list holds up to ${SOFT_MAX_SHOPPING_ITEMS}. Untick a few here, or clear what you've got in the Shopping tab.`;
    }
    return null;
  };
  const block = getBlock();

  const getEmptyText = () => {
    if (isRange && !isPlanLoaded) {
      return "Your plan for these days isn't loaded right now. Open them on the Calendar, then come back.";
    }
    if (isRange && span.meals.length === 0) {
      return 'Nothing is planned on these days yet.';
    }
    return "There's nothing to buy here yet.";
  };

  const getDraftText = (range: DraftRange) => {
    if (range.startKey === '') return 'Tap the first and last day.';
    if (range.endKey === '') {
      return 'Now tap the last day, or this day again for just one.';
    }
    const count = getPlanInRange(plannedByDay, range, todayKey).meals.length;
    return (
      <>
        <SpanText {...range} />{' '}
        <span className='whitespace-nowrap'>· {formatMealCount(count)}</span>
      </>
    );
  };

  const handleAdd = async () => {
    if (block !== null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(addToShoppingList({ uid, lines: selectedLines })).unwrap();
      onClose();
      addToast({
        title:
          selected.length === 1
            ? `Added ${selected[0].name} to your shopping list`
            : `Added ${selected.length} to your shopping list`,
        type: 'success',
        action: hasViewAction
          ? { label: 'View', onClick: showShoppingTab }
          : undefined,
      });
    } catch (addError) {
      setError(
        getErrorMessage(addError, 'Unable to add to your shopping list.'),
      );
      setIsSubmitting(false);
    }
  };

  const hintText = startsTicked
    ? 'Untick what you already have.'
    : 'Tick what you need.';
  const tickAll = rows.length > 0 && (
    <ActionChips
      className='shrink-0'
      actions={[
        {
          key: 'tick-all',
          icon: isAllTicked ? (
            <ListX className='h-4 w-4' />
          ) : (
            <ListChecks className='h-4 w-4' />
          ),
          label: isAllTicked ? 'Untick all' : 'Tick all',
          isDisabled: !isReady,
          onClick: () =>
            setChoices(
              Object.fromEntries(rows.map((row) => [row.id, !isAllTicked])),
            ),
        },
      ]}
    />
  );
  const stepper = recipe && (
    <div className='flex flex-wrap items-center gap-3'>
      <span className='text-sm'>For</span>
      <Stepper label='Servings' value={servings} onChange={setServings} />
      <span className='text-sm'>{servings === 1 ? 'serving' : 'servings'}</span>
    </div>
  );

  if (draft) {
    const isDraftDone = draft.startKey !== '' && draft.endKey !== '';
    return (
      <div className='grid gap-4'>
        <div className='space-y-3'>
          <Calendar
            mode='range'
            size='auto'
            className='mx-auto w-full max-w-sm'
            initialDate={toCellDate(draft.startKey || days.startKey)}
            minDate={toCellDate(todayKey)}
            maxDate={toCellDate(lastLoadedKey)}
            customStyles={RANGE_STYLES}
            onRangeSelect={({ start, end }) =>
              // The calendar reports a range from inside its own state update, so it is applied just after.
              queueMicrotask(() =>
                setDraft({
                  startKey: start ? getCellDayKey(start) : '',
                  endKey: end ? getCellDayKey(end) : '',
                }),
              )
            }
            renderCell={(date, _isSelected, isDisabled, isToday) => {
              const dayKey = getCellDayKey(date);
              const isEnd =
                dayKey === draft.startKey || dayKey === draft.endKey;
              const isInRange =
                draft.endKey !== '' &&
                dayKey >= draft.startKey &&
                dayKey <= draft.endKey;
              const hasMeals = !isDisabled && plannedByDay.has(dayKey);
              return (
                <span
                  className={join(
                    'relative flex h-9 w-full items-center justify-center rounded-md',
                    (isInRange || isEnd) && 'bg-[var(--pinch-drizzle-soft)]',
                    isEnd &&
                      'font-semibold shadow-[inset_0_0_0_1.5px_var(--pinch-drizzle)]',
                    isToday && !isEnd && 'font-semibold',
                  )}
                >
                  {date.getDate()}
                  {hasMeals && (
                    <span
                      className='bg-muted-foreground absolute bottom-1 h-1 w-1 rounded-full'
                      aria-hidden='true'
                    />
                  )}
                </span>
              );
            }}
          />
          <p
            className={join(
              'text-sm',
              isDraftDone ? 'font-medium' : 'text-muted-foreground',
            )}
            aria-live='polite'
          >
            {getDraftText(draft)}
          </p>
        </div>
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={() => setDraft(null)}
            >
              Back
            </Button>
          }
          rightActions={
            <Button
              type='button'
              disabled={!isDraftDone}
              onClick={() => {
                setDays(draft);
                setChoices({});
                setDraft(null);
              }}
            >
              Done
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-4'>
      <div
        className={join(
          'flex flex-col gap-3 [@media(max-height:500px)]:max-h-none',
          columnClassName,
        )}
      >
        <div
          className={join('shrink-0', isCompact ? 'space-y-2' : 'space-y-3')}
        >
          {isCompact && !isRange ? (
            <>
              <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                <div className='order-1 min-w-0 flex-1'>
                  <p className='text-lg font-medium wrap-break-word'>{label}</p>
                  {rows.length > 0 && (
                    <p className='text-muted-foreground truncate text-xs'>
                      Adding {selected.length} of {rows.length} · {hintText}
                    </p>
                  )}
                </div>
                {stepper && (
                  <div className='order-3 basis-full sm:order-2 sm:basis-auto'>
                    {stepper}
                  </div>
                )}
                <div className='order-2 sm:order-3'>{tickAll}</div>
              </div>
              {stockLine && <StockNote text={stockLine} />}
            </>
          ) : (
            <>
              {isRange ? (
                <SummaryRow
                  label='Days'
                  ariaLabel='Change the days'
                  onClick={
                    isPlanLoaded
                      ? () =>
                          setDraft({
                            startKey: span.startKey,
                            endKey:
                              span.startKey > span.endKey ? '' : span.endKey,
                          })
                      : undefined
                  }
                >
                  <span className='flex flex-wrap items-baseline gap-x-2'>
                    <span>
                      {span.startKey > span.endKey ? (
                        'These days have passed'
                      ) : (
                        <SpanText {...span} />
                      )}
                    </span>
                    {isPlanLoaded && span.startKey <= span.endKey && (
                      <span className='text-muted-foreground text-sm whitespace-nowrap'>
                        {formatMealCount(span.meals.length)}
                        {span.isClamped && ' from today on'}
                      </span>
                    )}
                  </span>
                </SummaryRow>
              ) : (
                <p className='text-lg font-medium wrap-break-word'>{label}</p>
              )}
              {stepper}
              {stockLine && (
                <p className='text-muted-foreground text-sm [@media(max-height:500px)]:hidden'>
                  {stockLine}
                </p>
              )}
              {rows.length > 0 && (
                <div className='flex items-center justify-between gap-3'>
                  <div className='text-muted-foreground min-w-0 text-sm'>
                    <p>
                      Adding {selected.length} of {rows.length}
                    </p>
                    <p className='text-xs'>{hintText}</p>
                  </div>
                  {tickAll}
                </div>
              )}
            </>
          )}
        </div>
        {rows.length === 0 ? (
          <p className='text-muted-foreground py-2 text-center text-sm'>
            {getEmptyText()}
          </p>
        ) : (
          <ul className='divide-border flex-1 divide-y overflow-y-auto [@media(max-height:500px)]:overflow-visible [@media(max-height:800px)]:min-h-36'>
            {shownRows.map((row) => {
              const state = getState(row);
              const hint =
                getOnListHint(
                  state,
                  formatSourceNames(state.matched.map(nameSource)),
                  state.openText,
                ) ?? getPantryHint(row);
              const amountText = formatShopAmount(
                getShopAmount(state.addLines, row.section),
              );
              return (
                <li key={row.id}>
                  {row.id === atHomeRows[0]?.id && (
                    <p className='text-muted-foreground pt-3 pb-0.5 text-xs'>
                      Usually at home: tick what you're out of
                    </p>
                  )}
                  <label className='flex min-h-12 cursor-pointer items-start gap-3 py-2.5'>
                    <span className='mt-0.5 inline-flex shrink-0'>
                      <Checkbox
                        aria-label={`Add ${row.name}`}
                        checked={isTicked(row)}
                        disabled={!isReady}
                        onCheckedChange={(checked) =>
                          setChoices((current) => ({
                            ...current,
                            [row.id]: checked === true,
                          }))
                        }
                      />
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-baseline justify-between gap-3'>
                        <span className='min-w-0 wrap-break-word'>
                          {row.name}
                        </span>
                        {amountText && (
                          <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                            {amountText}
                          </span>
                        )}
                      </span>
                      {hint && (
                        <span className='text-muted-foreground block text-xs'>
                          {hint}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <ModalFooterActions
        note={block}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSubmitting}
            disabled={isSubmitting || block !== null}
            onClick={() => void handleAdd()}
          >
            {selected.length > 0 ? `Add ${selected.length}` : 'Add'}
          </Button>
        }
      />
    </div>
  );
}

interface StockNoteProps {
  text: string;
}

function StockNote({ text }: StockNoteProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-expanded={isOpen}
      onClick={() => setIsOpen((open) => !open)}
      className="border-border bg-muted/50 text-muted-foreground! relative h-auto min-h-8 w-full justify-start gap-2 rounded-xl border px-3 py-1 text-left text-sm font-normal whitespace-normal before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] [@media(max-height:500px)]:hidden"
    >
      <span className={join('min-w-0 flex-1', !isOpen && 'truncate')}>
        {text}
      </span>
      <ChevronDown
        className={join('h-4 w-4 shrink-0', isOpen && 'rotate-180')}
        aria-hidden='true'
      />
    </Button>
  );
}

interface AddToShoppingSheetProps {
  uid: string;
  request: ShoppingRequest;
  onClose: () => void;
}

function AddToShoppingSheet({
  uid,
  request,
  onClose,
}: AddToShoppingSheetProps) {
  return (
    <FormSheet isOpen onClose={onClose} title='Shopping list'>
      <ShoppingPick uid={uid} request={request} onClose={onClose} />
    </FormSheet>
  );
}

export default AddToShoppingSheet;
