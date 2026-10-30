import { useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedWork } from '@/hooks/useUnsavedWork';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import Subview from '@/components/Subview';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import RecentPickRows from '@apps/pinch/components/plan/RecentPickRows';
import CategoryField from '@apps/pinch/components/shared/CategoryField';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
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
  selectShareBySource,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type {
  DishCategory,
  ItemKind,
  MealItem,
  MealType,
} from '@apps/pinch/types';
import { getCategories } from '@apps/pinch/utils/categories';
import { getCellDayKey, getPlannedDayKey } from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import {
  formatCost,
  getItemTitle,
  getPlannedMealTitle,
} from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import {
  getBuilderNote,
  getBuilderSnapshot,
  getDefaultMealType,
  getNearDayOptions,
  getOfferablePicks,
  getPlanDayWord,
  getWhenSummary,
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

// A landscape phone has so little height that the footer's note is folded into the primary's label.
const SHORT_SCREEN_QUERY = '(max-height: 449px)';

const subscribeToHeight = (onChange: () => void) => {
  const query = window.matchMedia(SHORT_SCREEN_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getIsShortScreen = () => window.matchMedia(SHORT_SCREEN_QUERY).matches;

// The most the recent list unfolds to; the one search finds anything past it.
const MAX_RECENT_PICKS = 12;

// Under this many things to offer, an empty plate says what to do next instead of leaving the screen bare.
const FEW_PICKS = 5;

const copyItems = (items: MealItem[]) =>
  items.map((item) => ({ ...item, id: generateUuid() }));

const getDraftKey = ({
  mode,
  plannedMealId,
  mealId,
  startRecipeId,
}: {
  mode: 'plan' | 'meal';
  plannedMealId: string | null;
  mealId: string | null;
  startRecipeId: string | null;
}) => {
  if (plannedMealId) return `pinch:meal-builder:planned:${plannedMealId}`;
  if (mode === 'meal' && mealId) return `pinch:meal-builder:meal:${mealId}`;
  if (mealId) return `pinch:meal-builder:new:${mode}:meal:${mealId}`;
  if (startRecipeId) {
    return `pinch:meal-builder:new:${mode}:recipe:${startRecipeId}`;
  }
  return `pinch:meal-builder:new:${mode}`;
};

const getRecentCaption = (kinds: Set<'RECIPE' | 'MEAL'>) => {
  if (!kinds.has('MEAL')) return 'Your recent recipes';
  if (!kinds.has('RECIPE')) return 'Your recent saved meals';
  return 'Your recent recipes and saved meals';
};

interface MealBuilderDraft {
  items: MealItem[];
  source: { id: string; name: string } | null;
  dayKey: string;
  chosenType: MealType | null;
  name: string;
  categories: DishCategory[];
}

const isDraftItem = (value: unknown): value is MealItem => {
  if (typeof value !== 'object' || value === null) return false;
  const { id, kind, refId, servings } = value as Partial<MealItem>;
  return (
    typeof id === 'string' &&
    (kind === 'RECIPE' || kind === 'INGREDIENT') &&
    typeof refId === 'string' &&
    typeof servings === 'number' &&
    Number.isFinite(servings) &&
    servings > 0
  );
};

function parseMealBuilderDraft(stored: unknown): MealBuilderDraft | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { items, source, dayKey, chosenType, name, categories } =
    stored as Partial<MealBuilderDraft>;
  const isShaped =
    Array.isArray(items) &&
    items.length <= MAX_MEAL_ITEMS &&
    items.every(isDraftItem) &&
    (source === null ||
      (typeof source === 'object' &&
        typeof source?.id === 'string' &&
        typeof source?.name === 'string')) &&
    typeof dayKey === 'string' &&
    fromDateInputValue(dayKey) !== null &&
    chosenType !== undefined &&
    (chosenType === null || MEAL_TYPES.some((type) => type === chosenType)) &&
    typeof name === 'string' &&
    name.length <= MAX_NAME_LENGTH &&
    Array.isArray(categories) &&
    categories.every((category) => typeof category === 'string');
  if (!isShaped) return null;
  return {
    items,
    source,
    dayKey,
    chosenType,
    name,
    categories: getCategories({ categories }),
  };
}

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
  const { subview, closeSubview, closeSubviewIf, showCalendarDay } =
    usePinchOverlay();
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
  const isShared = useAppSelector(
    (state) =>
      selectShareBySource('MEAL', existingMeal?.id ?? '')(state) !== null,
  );
  const starter =
    mode === 'plan' && !existingPlanned && mealId
      ? (savedMealsById.get(mealId) ?? null)
      : null;
  const startRecipeId =
    mode === 'plan' && !existingPlanned && !mealId && recipeId
      ? recipeId
      : null;
  const [start] = useState<MealBuilderDraft>(() => ({
    items:
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
    source: starter ? { id: starter.id, name: starter.name } : null,
    dayKey: existingPlanned
      ? getPlannedDayKey(existingPlanned.date)
      : initialDayKey,
    chosenType: existingPlanned?.mealType ?? initialType,
    name: existingMeal?.name ?? '',
    categories: getCategories(existingMeal ?? {}),
  }));
  const draftKey = getDraftKey({
    mode,
    plannedMealId,
    mealId,
    startRecipeId,
  });
  const draftBase = {
    updatedAt: existingPlanned?.updatedAt ?? existingMeal?.updatedAt ?? null,
    dayKey: start.dayKey,
    chosenType: start.chosenType,
  };
  const draft = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseMealBuilderDraft,
  });
  const [begin] = useState(() =>
    draft.restored === null
      ? start
      : {
          ...draft.restored,
          items: draft.restored.items.filter((item) =>
            item.kind === 'RECIPE'
              ? recipesById.has(item.refId)
              : ingredientsById.has(item.refId),
          ),
        },
  );
  const [dayKey, setDayKey] = useState(begin.dayKey);
  const [chosenType, setChosenType] = useState<MealType | null>(
    begin.chosenType,
  );
  const [isOtherDay, setIsOtherDay] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecentExpanded, setIsRecentExpanded] = useState(false);
  const [isSearchFirst] = useState(
    () =>
      mode === 'plan' &&
      !existingPlanned &&
      !starter &&
      !startRecipeId &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  const [items, setItems] = useState<MealItem[]>(begin.items);
  const [source, setSource] = useState(begin.source);
  const [name, setName] = useState(begin.name);
  const [categories, setCategories] = useState(begin.categories);
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
  const offerablePicks = useMemo(
    () =>
      getOfferablePicks(
        recentPicks,
        new Set(items.map((item) => item.refId)),
        new Map(
          savedMeals.map((meal) => [
            meal.id,
            meal.items.map((item) => item.refId),
          ]),
        ),
      ).slice(0, MAX_RECENT_PICKS),
    [recentPicks, items, savedMeals],
  );
  const [openingTotal] = useState(offerablePicks.length);
  const snapshot = getBuilderSnapshot({
    items,
    name,
    when: existingPlanned ? `${dayKey}|${mealType}` : null,
    categories,
  });
  const [openedWith] = useState(() =>
    getBuilderSnapshot({
      items: start.items,
      name: start.name,
      when: existingPlanned ? `${start.dayKey}|${start.chosenType}` : null,
      categories: start.categories,
    }),
  );
  const isDirty = snapshot !== openedWith;
  useUnsavedWork(() => isDirty);
  const draftValue = useMemo(
    () => ({ items, source, dayKey, chosenType, name, categories }),
    [items, source, dayKey, chosenType, name, categories],
  );
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: draftKey,
    base: draftBase,
    value: draftValue,
    isDirty,
  });
  const startOver = () => {
    setItems(start.items);
    setSource(start.source);
    setDayKey(start.dayKey);
    setChosenType(start.chosenType);
    setIsOtherDay(false);
    setName(start.name);
    setCategories(start.categories);
    draft.hideNotice();
  };
  const isShortScreen = useSyncExternalStore(
    subscribeToHeight,
    getIsShortScreen,
    () => false,
  );
  const isAskingRef = useRef(false);
  const plateTitle = getPlannedMealTitle(
    { name: source?.name ?? existingPlanned?.name ?? null, items },
    recipesById,
    ingredientsById,
  );
  const getTitle = () => {
    if (mode === 'meal') {
      return name.trim() || (existingMeal ? 'Saved meal' : 'New saved meal');
    }
    return plateTitle || 'Plan a meal';
  };
  const title = getTitle();
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

    const openedAs = subview;
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'meal') {
        await dispatch(
          saveMeal({
            uid,
            id: existingMeal?.id ?? null,
            name,
            categories,
            items: rows(),
          }),
        ).unwrap();
        closeSubviewIf((current) => current === openedAs);
        addToast({ title: `Saved ${name.trim()}`, type: 'success' });
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
      const plannedName = source?.name ?? existingPlanned?.name ?? null;
      const more = items.length > 1 ? ` and ${items.length - 1} more` : '';
      const what =
        plannedName ??
        `${getItemTitle(items[0], recipesById, ingredientsById)}${more}`;
      const landedOn = dayKey;
      closeSubviewIf((current) => current === openedAs);
      addToast({
        title: `${existingPlanned ? 'Saved' : 'Planned'} ${what} for ${getDayWord(dayKey)}`,
        type: 'success',
        action: { label: 'View', onClick: () => showCalendarDay(landedOn) },
      });
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
      message: `Delete ${existingMeal.name}? Days you've already planned it on keep their own copy.${isShared ? " It's shared, so its link stops working too." : ''} This action cannot be undone.`,
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

  const getDiscardCopy = () => {
    if (existingPlanned || existingMeal) {
      return {
        title: 'Discard your changes?',
        message:
          "They aren't saved yet. If you leave now, this meal stays as it was.",
      };
    }
    return {
      title: 'Discard this meal?',
      message:
        mode === 'meal'
          ? "It isn't saved yet. If you leave now, what you've added is lost."
          : "It isn't on your plan yet. If you leave now, what's on the plate is lost.",
    };
  };

  const goBack = async () => {
    if (!isDirty || isSubmitting) {
      closeSubview();
      return;
    }
    if (isAskingRef.current) {
      return;
    }

    const openedAs = subview;
    isAskingRef.current = true;
    try {
      const confirmed = await confirm({
        ...getDiscardCopy(),
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (confirmed) {
        closeSubviewIf((current) => current === openedAs);
      }
    } finally {
      isAskingRef.current = false;
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

  const getSubmitLabel = () => {
    if (mode === 'meal' || existingPlanned) return 'Save';
    if (date === null) return 'Plan';
    return `Plan for ${getDayWord(dayKey)}`;
  };

  const note = isSubmitting
    ? null
    : getBuilderNote({
        mode,
        hasName: name.trim() !== '',
        hasDay: date !== null,
        hasItems: items.length > 0,
      });
  const submitLabel = isShortScreen && note ? note : getSubmitLabel();
  const isTitleGiven =
    mode === 'meal' || Boolean(source?.name ?? existingPlanned?.name);
  const getEmptyLine = () => {
    const what =
      mode === 'plan'
        ? 'a recipe, a saved meal or a single ingredient'
        : 'a recipe or an ingredient';
    return offerablePicks.length === 0
      ? `Search for ${what}, and it goes on the plate.`
      : `Tap one above, or search for ${what}. It goes on the plate.`;
  };
  const recentCaption = getRecentCaption(
    new Set(offerablePicks.map((pick) => pick.kind)),
  );

  return (
    <Subview
      overlay
      title={title}
      isTitleWrapped={isTitleGiven}
      onClose={closeSubview}
      onBack={() => void goBack()}
    >
      <div className='flex flex-1 flex-col gap-5'>
        {draft.isNoticeShown && (
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={draft.hideNotice}
          />
        )}
        <UndoSnackbar pending={pending} onUndo={undo} />
        {mode === 'plan' ? (
          <SummaryEditor
            isFramed
            icon='📅'
            label='When'
            title='Day and meal'
            lines={2}
            summary={
              date === null
                ? ''
                : getWhenSummary(dayKey, todayKey, {
                    label: MEAL_TYPE_LABELS[mealType],
                    emoji: MEAL_TYPE_EMOJIS[mealType],
                  })
            }
            placeholder='Pick a day'
            problem={date === null ? 'A meal needs a day to go on.' : null}
          >
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
          </SummaryEditor>
        ) : (
          <SummaryEditor
            isFramed
            icon='🍽️'
            label='Name'
            title='Name'
            lines={2}
            summary={name.trim()}
            placeholder='Add a name'
            defaultOpen={existingMeal === null}
          >
            <Input
              variant='outline'
              aria-label='Meal name'
              placeholder='Taco night'
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </SummaryEditor>
        )}
        {mode === 'meal' && (
          <CategoryField isFramed value={categories} onChange={setCategories} />
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
              onTypingChange={setIsTyping}
              excludeIds={items.map((item) => item.refId)}
              onPick={(id) => addItem('INGREDIENT', id)}
              onPickRecipe={(id) => addItem('RECIPE', id)}
              onPickMeal={mode === 'plan' ? pickSavedMeal : undefined}
              autoFocus={isSearchFirst}
            />
          )}
          {items.length > 0 && (
            <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
              {items.map((item) => {
                const itemTitle = getItemTitle(
                  item,
                  recipesById,
                  ingredientsById,
                );
                const recipe =
                  item.kind === 'RECIPE' ? recipesById.get(item.refId) : null;
                return (
                  <li key={item.id} className='px-3 py-2'>
                    <div className='flex min-h-11 items-start gap-3'>
                      {item.kind === 'RECIPE' ? (
                        <CoverImage
                          coverPath={recipe?.coverPath ?? null}
                          coverUrl={recipe?.coverUrl ?? null}
                          version={recipe?.updatedAt ?? 0}
                          size={40}
                        />
                      ) : (
                        <span
                          className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
                          aria-hidden='true'
                        >
                          🥕
                        </span>
                      )}
                      <span className='min-w-0 flex-1 pt-2.5 font-medium wrap-break-word'>
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
                    <div className='-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-13'>
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
          <div className='bg-accent/60 border-border space-y-2 rounded-2xl border p-3'>
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

        {!isFull && !isTyping && offerablePicks.length > 0 && (
          <RecentPickRows
            uid={uid}
            caption={recentCaption}
            picks={offerablePicks}
            openingTotal={openingTotal}
            isExpanded={isRecentExpanded}
            onExpandedChange={setIsRecentExpanded}
            onPick={pickRecent}
          />
        )}

        {!isFull &&
          !isTyping &&
          items.length === 0 &&
          offerablePicks.length < FEW_PICKS && (
            <p className='bg-accent/60 border-border rounded-2xl border p-4 text-sm'>
              {getEmptyLine()}
            </p>
          )}

        {error && <p className='text-destructive text-sm'>{error}</p>}

        <ModalFooterActions
          note={isShortScreen ? null : note}
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
              onClick={() => void goBack()}
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
              {submitLabel}
            </Button>
          }
        />
      </div>
    </Subview>
  );
}

export default MealBuilder;
