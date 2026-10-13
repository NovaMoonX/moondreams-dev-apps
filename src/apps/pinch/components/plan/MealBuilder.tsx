import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import ServingStepper from '@apps/pinch/components/plan/ServingStepper';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
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
  selectCostContext,
  selectIngredientsById,
  selectMeals,
  selectMealsById,
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { ItemKind, MealItem, MealType } from '@apps/pinch/types';
import {
  formatDayTitle,
  getCellDayKey,
  getPlannedDayKey,
} from '@apps/pinch/utils/dayKeys';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';

const MEAL_TYPE_OPTIONS = MEAL_TYPES.map((value) => ({
  value,
  label: MEAL_TYPE_LABELS[value],
  emoji: MEAL_TYPE_EMOJIS[value],
}));

const copyItems = (items: MealItem[]) =>
  items.map((item) => ({ ...item, id: generateUuid() }));

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
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const savedMeals = useAppSelector(selectMeals);
  const savedMealsById = useAppSelector(selectMealsById);
  const existingPlanned =
    useAppSelector(selectPlannedMeals).find(
      (meal) => meal.id === plannedMealId,
    ) ?? null;
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
  const [mealType, setMealType] = useState<MealType>(
    existingPlanned?.mealType ?? initialType ?? 'DINNER',
  );
  const [isChanging, setIsChanging] = useState(false);
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
                servings: 1,
              },
            ]
          : []),
  );
  const [source, setSource] = useState<{ id: string; name: string } | null>(
    starter ? { id: starter.id, name: starter.name } : null,
  );
  const [name, setName] = useState(existingMeal?.name ?? '');
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [createdMealId, setCreatedMealId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = fromDateInputValue(dayKey) ?? null;
  const cost = useMemo(
    () => getMealCost(items, costContext),
    [items, costContext],
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);
  const isFull = items.length >= MAX_MEAL_ITEMS;
  const isMissing =
    (mode === 'plan' && plannedMealId !== null && existingPlanned === null) ||
    (mode === 'meal' && mealId !== null && existingMeal === null);
  const wantsSaveAsMeal = mode === 'plan' && saveAsMeal && items.length >= 2;
  const isValid =
    items.length > 0 &&
    (mode === 'meal'
      ? name.trim() !== ''
      : date !== null && (!wantsSaveAsMeal || newMealName.trim() !== ''));

  if (isMissing) {
    return (
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
    );
  }

  const addItem = (kind: ItemKind, refId: string) =>
    setItems((current) =>
      current.length >= MAX_MEAL_ITEMS
        ? current
        : [...current, { id: generateUuid(), kind, refId, servings: 1 }],
    );

  const pickSavedMeal = (id: string) => {
    const meal = savedMealsById.get(id);
    if (meal) {
      setItems(copyItems(meal.items));
      setSource({ id: meal.id, name: meal.name });
    }
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
      if (wantsSaveAsMeal) {
        const savedId = await dispatch(
          saveMeal({
            uid,
            id: createdMealId,
            name: newMealName,
            items: rows(),
          }),
        ).unwrap();
        setCreatedMealId(savedId);
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
      return recipe
        ? `Recipe serves ${Math.round(recipe.servings * 100) / 100}`
        : '';
    }
    const serving = ingredientsById.get(item.refId)?.serving;
    return serving
      ? `1 serving = ${Math.round(serving.amount * 100) / 100} ${UNIT_LABELS[serving.unit]}`
      : '';
  };

  const getDayWord = (key: string) =>
    key === getCellDayKey(new Date()) ? 'today' : formatDayTitle(key);

  const getSubmitLabel = () => {
    if (mode === 'meal' || existingPlanned || date === null) return 'Save';
    return `Add to ${getDayWord(dayKey)}`;
  };

  return (
    <div className='flex flex-1 flex-col gap-5'>
      {mode === 'plan' ? (
        <div className='space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='min-w-0 font-medium'>
              {date === null ? 'Pick a day' : formatDayTitle(dayKey)} ·{' '}
              <span className='whitespace-nowrap'>
                {MEAL_TYPE_EMOJIS[mealType]} {MEAL_TYPE_LABELS[mealType]}
              </span>
            </p>
            <Button
              type='button'
              variant='link'
              className='h-10 shrink-0'
              onClick={() => setIsChanging((current) => !current)}
            >
              {isChanging ? 'Done' : 'Change'}
            </Button>
          </div>
          {isChanging && (
            <div className='space-y-3'>
              <PillGroup
                label='Meal'
                options={MEAL_TYPE_OPTIONS}
                value={mealType}
                onChange={setMealType}
              />
              <div className='space-y-1.5'>
                <Label>Day</Label>
                <Input
                  type='date'
                  variant='outline'
                  aria-label='Day'
                  value={dayKey}
                  onChange={(event) => setDayKey(event.target.value)}
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

      {mode === 'plan' &&
        !existingPlanned &&
        savedMeals.length > 0 &&
        items.length === 0 && (
          <div className='space-y-2'>
            <h2 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
              Start from a saved meal
            </h2>
            <PillGroup
              label='Start from a saved meal'
              options={savedMeals.map((meal) => ({
                value: meal.id,
                label: meal.name,
              }))}
              value={source?.id ?? null}
              onChange={pickSavedMeal}
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
          />
        )}
        {items.length > 0 && (
          <ul className='divide-border divide-y'>
            {items.map((item) => {
              const title = getItemTitle(item, recipesById, ingredientsById);
              return (
                <li key={item.id} className='space-y-1 py-2'>
                  <div className='flex items-start gap-3'>
                    <span className='flex h-10 shrink-0 items-center'>
                      <ItemIcon
                        kind={item.kind}
                        iconKey={
                          item.kind === 'INGREDIENT'
                            ? (ingredientsById.get(item.refId)?.iconKey ?? null)
                            : null
                        }
                      />
                    </span>
                    <span className='min-w-0 flex-1 pt-2 font-medium wrap-break-word'>
                      {title}
                    </span>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={`Remove ${title}`}
                      className='size-10 shrink-0'
                      onClick={() => {
                        if (items.length === 1) setSource(null);
                        setItems((current) =>
                          current.filter((row) => row.id !== item.id),
                        );
                      }}
                    >
                      <X className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  </div>
                  <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-10'>
                    <span className='text-muted-foreground text-xs'>
                      {getServingCaption(item)}
                    </span>
                    <span className='flex items-center gap-2'>
                      <ServingStepper
                        label={`Servings of ${title}`}
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
                        servings
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {items.length > 0 && (
        <div>
          <p className='text-sm'>
            <span className='font-medium'>
              {cost.totalCents === null
                ? 'No prices yet'
                : `Cost ${formatCost(cost.totalCents)}`}
            </span>
            {leftOutCount > 0 && cost.totalCents !== null && (
              <span className='text-muted-foreground'>
                {' '}
                · {formatLeftOut(cost.leftOut)}
              </span>
            )}
          </p>
        </div>
      )}

      {mode === 'plan' && items.length >= 2 && (
        <div className='space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-sm font-medium'>Save as a meal</span>
            <AppToggle
              aria-label='Save as a meal'
              checked={saveAsMeal}
              onCheckedChange={setSaveAsMeal}
            />
          </div>
          {saveAsMeal && (
            <Input
              variant='outline'
              aria-label='Name for the saved meal'
              placeholder='Taco night'
              maxLength={MAX_NAME_LENGTH}
              value={newMealName}
              onChange={(event) => setNewMealName(event.target.value)}
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
  );
}

export default MealBuilder;
