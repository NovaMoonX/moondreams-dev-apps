import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { X } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import Subview from '@/components/Subview';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import Stepper from '@/components/Stepper';
import {
  MAX_MEAL_ITEMS,
  MAX_NAME_LENGTH,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { removeMeal, saveMeal } from '@apps/pinch/store/actions/mealActions';
import {
  planMeal,
  updatePlannedMeal,
} from '@apps/pinch/store/actions/plannedMealActions';
import {
  selectCookSummaries,
  selectCostContext,
  selectIngredientsById,
  selectMeals,
  selectMealsById,
  selectPlannedByDay,
  selectPlannedMeals,
  selectRecipes,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { ItemKind, MealItem, MealType } from '@apps/pinch/types';
import {
  formatDayTitle,
  getCellDayKey,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  getItemTitle,
  getPlannedMealTitle,
} from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getDefaultMealType,
  getNearDayOptions,
  getPlanDayWord,
  rankRecentPicks,
} from '@apps/pinch/utils/planPicks';
import {
  getMealNutrition,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';

const MEAL_TYPE_OPTIONS = MEAL_TYPES.map((value) => ({
  value,
  label: MEAL_TYPE_LABELS[value],
  emoji: MEAL_TYPE_EMOJIS[value],
}));

const OTHER_DAY = 'other';

// Past 12 options a pill row adds its own search, and the item search is the one place to look.
const MAX_RECENT_PICKS = 12;

const copyItems = (items: MealItem[]) =>
  items.map((item) => ({ ...item, id: generateUuid() }));

const getRecentCaption = (kinds: Set<'RECIPE' | 'MEAL'>) => {
  if (!kinds.has('MEAL')) return 'Your recent recipes';
  if (!kinds.has('RECIPE')) return 'Your recent saved meals';
  return 'Your recent recipes and saved meals';
};

interface MealBuilderProps {
  uid: string;
  /** `plan` puts a meal on a day; `meal` builds a saved meal with no day. */
  mode: 'plan' | 'meal';
  dayKey: string;
  mealType: MealType | null;
  /** The planned meal being changed; null plans a new one. */
  plannedMealId: string | null;
  /** A saved meal whose items start the plate (plan), or the saved meal being changed (meal). */
  mealId: string | null;
  /** A recipe that starts the plate (plan). */
  recipeId?: string | null;
}

/** Builds a meal from any mix of recipes and ingredients with servings on each, then plans it on a day or saves it for later. */
function MealBuilder({
  uid,
  mode,
  dayKey: initialDayKey,
  mealType: initialType,
  plannedMealId,
  mealId,
  recipeId = null,
}: MealBuilderProps) {
  const { closeSubview } = usePinchOverlay();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { pending, showUndo, undo } = useUndoRemoval();
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const savedMeals = useAppSelector(selectMeals);
  const savedMealsById = useAppSelector(selectMealsById);
  const recipes = useAppSelector(selectRecipes);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const cookSummaries = useAppSelector(selectCookSummaries);
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const now = useNow(60_000);
  const existingPlanned =
    plannedMeals.find((meal) => meal.id === plannedMealId) ?? null;
  const existingMeal =
    mode === 'meal' && mealId ? (savedMealsById.get(mealId) ?? null) : null;
  const starter =
    mode === 'plan' && !existingPlanned && mealId
      ? (savedMealsById.get(mealId) ?? null)
      : null;
  const startRecipeId =
    mode === 'plan' && !existingPlanned && !mealId && recipeId
      ? recipeId
      : null;
  const [dayKey, setDayKey] = useState(
    existingPlanned ? getPlannedDayKey(existingPlanned.date) : initialDayKey,
  );
  const [chosenType, setChosenType] = useState<MealType | null>(
    existingPlanned?.mealType ?? initialType,
  );
  const [isChanging, setIsChanging] = useState(
    startRecipeId !== null || starter !== null,
  );
  const [isOtherDay, setIsOtherDay] = useState(false);
  const [isSearchFirst] = useState(
    mode === 'plan' && !existingPlanned && !starter && !startRecipeId,
  );
  const [items, setItems] = useState<MealItem[]>(
    existingPlanned?.items ??
      existingMeal?.items ??
      (starter
        ? copyItems(starter.items)
        : startRecipeId
          ? [
              {
                id: generateUuid(),
                kind: 'RECIPE' as const,
                refId: startRecipeId,
                servings: recipesById.get(startRecipeId)?.servings ?? 1,
              },
            ]
          : []),
  );
  const [source, setSource] = useState<{ id: string; name: string } | null>(
    starter ? { id: starter.id, name: starter.name } : null,
  );
  const [name, setName] = useState(existingMeal?.name ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = fromDateInputValue(dayKey) ?? null;
  const todayKey = getCellDayKey(new Date(now));
  const nearDayOptions = getNearDayOptions(todayKey);
  const dayOptions = [
    ...nearDayOptions,
    { value: OTHER_DAY, label: 'Other day…' },
  ];
  const dayPillValue =
    isOtherDay || !nearDayOptions.some((option) => option.value === dayKey)
      ? OTHER_DAY
      : dayKey;
  const mealType =
    chosenType ??
    getDefaultMealType(
      (plannedByDay.get(dayKey) ?? []).map((meal) => meal.mealType),
      dayKey === todayKey,
      new Date(now).getHours(),
    );
  const cost = useMemo(
    () => getMealCost(items, costContext),
    [items, costContext],
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
  const show = useAppSelector(selectShowNutrition);
  const nutrition = useMemo(
    () =>
      getMealNutrition(
        items,
        costContext.recipeNutrition,
        costContext.ingredientsById,
      ),
    [items, costContext],
  );
  const recentPicks = useMemo(
    () =>
      rankRecentPicks({
        recipes,
        meals: mode === 'plan' ? savedMeals : [],
        plannedMeals,
        cookSummaries,
      }),
    [mode, recipes, savedMeals, plannedMeals, cookSummaries],
  );
  const plateTitle = getPlannedMealTitle(
    { name: source?.name ?? existingPlanned?.name ?? null, items },
    recipesById,
    ingredientsById,
  );
  const getTitle = () => {
    if (mode === 'meal') {
      return name.trim() || existingMeal?.name || 'Saved meal';
    }
    if (plateTitle) {
      return plateTitle;
    }
    return date === null
      ? MEAL_TYPE_LABELS[mealType]
      : `${MEAL_TYPE_LABELS[mealType]} · ${formatDayTitle(dayKey)}`;
  };
  const title = getTitle();
  const isSlotTitle = mode === 'plan' && plateTitle === '';
  const isFull = items.length >= MAX_MEAL_ITEMS;
  const isMissing =
    (mode === 'plan' && plannedMealId !== null && existingPlanned === null) ||
    (mode === 'meal' && mealId !== null && existingMeal === null);
  const isValid =
    items.length > 0 && (mode === 'meal' ? name.trim() !== '' : date !== null);

  if (isMissing) {
    return (
      <Subview overlay title='Meal' onClose={closeSubview}>
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm'>
            {mode === 'plan'
              ? 'This meal has been removed from its day.'
              : 'This meal has been deleted.'}
          </p>
          <Button type='button' variant='secondary' onClick={closeSubview}>
            Close
          </Button>
        </div>
      </Subview>
    );
  }

  const addItem = (kind: ItemKind, refId: string) =>
    setItems((current) =>
      current.length >= MAX_MEAL_ITEMS
        ? current
        : [
            ...current,
            {
              id: generateUuid(),
              kind,
              refId,
              servings:
                kind === 'RECIPE' ? (recipesById.get(refId)?.servings ?? 1) : 1,
            },
          ],
    );

  const removeItem = (item: MealItem, itemTitle: string) => {
    const index = items.findIndex((row) => row.id === item.id);
    const previousSource = source;
    if (items.length === 1) setSource(null);
    setItems((current) => current.filter((row) => row.id !== item.id));
    showUndo(`Removed ${itemTitle}`, () => {
      setItems((current) => [
        ...current.slice(0, index),
        item,
        ...current.slice(index),
      ]);
      if (items.length === 1) setSource(previousSource);
    });
  };

  const pickSavedMeal = (id: string) => {
    const meal = savedMealsById.get(id);
    if (!meal) {
      return;
    }
    if (items.length === 0 && !existingPlanned) {
      setItems(copyItems(meal.items));
      setSource({ id: meal.id, name: meal.name });
      return;
    }
    setItems((current) => {
      const onPlate = new Set(current.map((item) => item.refId));
      const added = copyItems(
        meal.items.filter((item) => !onPlate.has(item.refId)),
      );
      return [...current, ...added].slice(0, MAX_MEAL_ITEMS);
    });
  };

  const pickRecent = (value: string) => {
    const [kind, id] = value.split(':');
    if (kind === 'MEAL') {
      pickSavedMeal(id);
      return;
    }
    addItem('RECIPE', id);
  };

  const getRecentRow = () => {
    if (mode !== 'plan' || existingPlanned || items.length > 0) {
      return undefined;
    }
    const picks = recentPicks.slice(0, MAX_RECENT_PICKS);
    if (picks.length === 0) {
      return undefined;
    }
    const caption = getRecentCaption(new Set(picks.map((pick) => pick.kind)));
    return (
      <div className='space-y-2 pt-1'>
        <p className='text-muted-foreground text-sm'>{caption}</p>
        <PillGroup
          label={caption}
          options={picks.map((pick) => ({
            value: `${pick.kind}:${pick.id}`,
            label: pick.label,
            emoji: pick.kind === 'MEAL' ? '🍽️' : '🍲',
          }))}
          value={null}
          onChange={pickRecent}
        />
      </div>
    );
  };

  const rows = () =>
    items.map(({ id, kind, refId, servings }) => ({
      id,
      kind,
      refId,
      servings,
    }));

  const handleSubmit = async () => {
    if (!isValid) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'meal') {
        await dispatch(
          saveMeal({ uid, id: existingMeal?.id ?? null, name, items: rows() }),
        ).unwrap();
        addToast({ title: `Saved ${name.trim()}`, type: 'success' });
        closeSubview();
        return;
      }

      if (date === null) {
        return;
      }
      if (existingPlanned) {
        await dispatch(
          updatePlannedMeal({
            uid,
            id: existingPlanned.id,
            date,
            mealType,
            items: rows(),
          }),
        ).unwrap();
      } else {
        await dispatch(
          planMeal({
            uid,
            date,
            mealType,
            items: rows().map(({ kind, refId, servings }) => ({
              kind,
              refId,
              servings,
            })),
            name: source?.name ?? null,
            sourceMealId: source?.id ?? null,
          }),
        ).unwrap();
      }
      addToast({
        title: existingPlanned
          ? `Saved ${MEAL_TYPE_LABELS[mealType].toLowerCase()} for ${getDayWord(dayKey)}`
          : `Added ${source?.name ?? getItemTitle(items[0], recipesById, ingredientsById)}${!source && items.length > 1 ? ` and ${items.length - 1} more` : ''} to ${getDayWord(dayKey)}`,
        type: 'success',
      });
      closeSubview();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this meal.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingMeal) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete meal',
      message: `Delete ${existingMeal.name}? Days you've already planned it on keep their own copy. This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeMeal({ uid, id: existingMeal.id })).unwrap();
      closeSubview();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this meal.'));
      setIsSubmitting(false);
    }
  };

  const getServingCaption = (item: MealItem) => {
    if (item.kind === 'RECIPE') {
      const recipe = recipesById.get(item.refId);
      if (!recipe) return '';
      return item.servings === recipe.servings
        ? 'The whole recipe'
        : `Recipe serves ${Math.round(recipe.servings * 100) / 100}`;
    }
    const serving = ingredientsById.get(item.refId)?.serving;
    return serving
      ? `1 serving = ${Math.round(serving.amount * 100) / 100} ${UNIT_LABELS[serving.unit]}`
      : '';
  };

  const getDayWord = (key: string) => getPlanDayWord(key, todayKey);

  const getChangeLabel = () => {
    if (isChanging) return 'Done';
    return isSlotTitle ? 'Change day or meal' : 'Change';
  };

  const getSubmitLabel = () => {
    if (mode === 'meal' || existingPlanned) return 'Save';
    if (date === null) return 'Plan';
    return `Plan for ${getDayWord(dayKey)}`;
  };

  return (
    <Subview overlay title={title} onClose={closeSubview}>
      <div className='flex flex-1 flex-col gap-5'>
        <UndoSnackbar pending={pending} onUndo={undo} />
        {mode === 'plan' ? (
          <div className='space-y-3'>
            <div
              className={join(
                'flex items-center gap-3',
                isSlotTitle ? 'justify-start' : 'justify-between',
              )}
            >
              {!isSlotTitle && (
                <p className='min-w-0 font-medium'>
                  {date === null ? 'Pick a day' : formatDayTitle(dayKey)} ·{' '}
                  <span className='whitespace-nowrap'>
                    {MEAL_TYPE_EMOJIS[mealType]} {MEAL_TYPE_LABELS[mealType]}
                  </span>
                </p>
              )}
              <Button
                type='button'
                variant='link'
                className={join('h-10 shrink-0', isSlotTitle && 'px-0!')}
                aria-expanded={isChanging}
                onClick={() => setIsChanging((current) => !current)}
              >
                {getChangeLabel()}
              </Button>
            </div>
            {isChanging && (
              <div className='space-y-3'>
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>Day</p>
                  <PillGroup
                    label='Day'
                    options={dayOptions}
                    value={dayPillValue}
                    onChange={(value) => {
                      setIsOtherDay(value === OTHER_DAY);
                      if (value !== OTHER_DAY) setDayKey(value);
                    }}
                  />
                  {dayPillValue === OTHER_DAY && (
                    <Input
                      type='date'
                      variant='outline'
                      aria-label='Other day'
                      value={dayKey}
                      onChange={(event) => setDayKey(event.target.value)}
                    />
                  )}
                </div>
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>Meal</p>
                  <PillGroup
                    label='Meal'
                    options={MEAL_TYPE_OPTIONS}
                    value={mealType}
                    onChange={setChosenType}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className='space-y-1.5'>
            <Label>Name</Label>
            <Input
              variant='outline'
              aria-label='Meal name'
              placeholder='Taco night'
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        )}

        <section aria-label="What's on the plate" className='space-y-3'>
          <h2 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            What's on the plate?
          </h2>
          {isFull ? (
            <p className='text-muted-foreground text-sm'>
              A meal holds up to {MAX_MEAL_ITEMS} items. Remove one to add
              another.
            </p>
          ) : (
            <ItemSearch
              uid={uid}
              excludeIds={items.map((item) => item.refId)}
              onPick={(id) => addItem('INGREDIENT', id)}
              onPickRecipe={(id) => addItem('RECIPE', id)}
              onPickMeal={mode === 'plan' ? pickSavedMeal : undefined}
              autoFocus={isSearchFirst}
              idle={getRecentRow()}
            />
          )}
          {items.length > 0 && (
            <ul className='divide-border divide-y'>
              {items.map((item) => {
                const itemTitle = getItemTitle(
                  item,
                  recipesById,
                  ingredientsById,
                );
                return (
                  <li key={item.id} className='py-2'>
                    <div className='flex items-start gap-3'>
                      <span className='min-w-0 flex-1 pt-2 font-medium wrap-break-word'>
                        {itemTitle}
                      </span>
                      <Button
                        type='button'
                        variant='tertiary'
                        size='icon'
                        aria-label={`Remove ${itemTitle}`}
                        className='size-10 shrink-0'
                        onClick={() => removeItem(item, itemTitle)}
                      >
                        <X className='h-4 w-4' aria-hidden='true' />
                      </Button>
                    </div>
                    <div className='-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1'>
                      <Stepper
                        isCompact
                        label={`Servings of ${itemTitle}`}
                        value={item.servings}
                        onChange={(servings) =>
                          setItems((current) =>
                            current.map((row) =>
                              row.id === item.id ? { ...row, servings } : row,
                            ),
                          )
                        }
                      />
                      <span className='text-muted-foreground text-xs'>
                        {item.servings === 1 ? 'serving' : 'servings'} ·{' '}
                        {getServingCaption(item)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {items.length > 0 && (
          <div className='bg-accent/60 space-y-2 rounded-2xl p-3'>
            <p className='flex items-center gap-1.5 text-sm'>
              <span className='font-semibold'>
                {cost.totalCents === null
                  ? 'No prices yet'
                  : `Cost ${formatCost(cost.totalCents)}`}
              </span>
              {leftOutCount > 0 && cost.totalCents !== null && (
                <HelpTip
                  variant='warning'
                  title="What's left out"
                  placement='top'
                >
                  This {formatLeftOut(cost.leftOut)} because there’s no price
                  for {leftOutCount === 1 ? 'it' : 'them'} yet. Add prices from
                  the meal once it’s saved.
                </HelpTip>
              )}
            </p>
            {hasShownValue(nutrition.values, show) && (
              <MacroStats
                values={nutrition.values}
                show={show}
                className='text-sm'
              />
            )}
          </div>
        )}

        {error && <p className='text-destructive text-sm'>{error}</p>}

        <ModalFooterActions
          leftActions={
            existingMeal && (
              <DeleteIconButton
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              />
            )
          }
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={closeSubview}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSubmitting}
              disabled={isSubmitting || !isValid}
              onClick={() => void handleSubmit()}
            >
              {getSubmitLabel()}
            </Button>
          }
        />
      </div>
    </Subview>
  );
}

export default MealBuilder;
