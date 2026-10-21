import { useMemo, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import ServingStepper from '@apps/pinch/components/plan/ServingStepper';
import ItemIcon from '@apps/pinch/components/shared/ItemIcon';
import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { planMeal } from '@apps/pinch/store/actions/plannedMealActions';
import {
  selectCostContext,
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { ItemKind, MealItem, MealType } from '@apps/pinch/types';
import { formatDayTitle, formatWeekday } from '@apps/pinch/utils/dayKeys';
import { formatCost, getItemTitle } from '@apps/pinch/utils/mealFormat';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';

const MEAL_TYPE_OPTIONS = MEAL_TYPES.map((value) => ({
  value,
  label: MEAL_TYPE_LABELS[value],
  emoji: MEAL_TYPE_EMOJIS[value],
}));

interface PlanMealSubviewProps {
  uid: string;
  dayKey: string;
  mealType: MealType | null;
}

function PlanMealSubview({
  uid,
  dayKey: initialDayKey,
  mealType: initialType,
}: PlanMealSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const costContext = useAppSelector(selectCostContext);
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [mealType, setMealType] = useState<MealType>(initialType ?? 'DINNER');
  const [isChanging, setIsChanging] = useState(false);
  const [items, setItems] = useState<MealItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = fromDateInputValue(dayKey) ?? null;
  const cost = useMemo(
    () => getMealCost(items, costContext),
    [items, costContext],
  );
  const leftOutCount = countLeftOutIngredients(cost.leftOut);

  const addItem = (kind: ItemKind, refId: string) =>
    setItems((current) => [
      ...current,
      { id: generateUuid(), kind, refId, servings: 1 },
    ]);

  const handleSubmit = async () => {
    if (date === null || items.length === 0) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        planMeal({
          uid,
          date,
          mealType,
          items: items.map(({ kind, refId, servings }) => ({
            kind,
            refId,
            servings,
          })),
          name: null,
          sourceMealId: null,
        }),
      ).unwrap();
      addToast({
        title: `Added ${getItemTitle(items[0], recipesById, ingredientsById)} to ${formatWeekday(dayKey)}`,
        type: 'success',
      });
      closeSubview();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to plan this meal.'));
      setIsSubmitting(false);
    }
  };

  return (
    <Subview overlay title='Meal' onClose={closeSubview}>
      <div className='flex flex-1 flex-col gap-5'>
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

        <section aria-label="What's on the plate" className='space-y-3'>
          <h2 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            What's on the plate?
          </h2>
          {items.length > 0 && (
            <ul className='divide-border divide-y'>
              {items.map((item) => {
                const title = getItemTitle(item, recipesById, ingredientsById);
                return (
                  <li key={item.id} className='flex items-center gap-3 py-2'>
                    <ItemIcon
                      kind={item.kind}
                      iconKey={
                        item.kind === 'INGREDIENT'
                          ? (ingredientsById.get(item.refId)?.iconKey ?? null)
                          : null
                      }
                    />
                    <span className='min-w-0 flex-1 truncate font-medium'>
                      {title}
                    </span>
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
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={`Remove ${title}`}
                      className='size-10 shrink-0'
                      onClick={() =>
                        setItems((current) =>
                          current.filter((row) => row.id !== item.id),
                        )
                      }
                    >
                      <X className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length === 0 && (
            <ItemSearch
              uid={uid}
              onPick={(id) => addItem('INGREDIENT', id)}
              onPickRecipe={(id) => addItem('RECIPE', id)}
            />
          )}
        </section>

        {items.length > 0 && (
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
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}

        <ModalFooterActions
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
              disabled={isSubmitting || items.length === 0 || date === null}
              onClick={() => void handleSubmit()}
            >
              {date === null ? 'Add' : `Add to ${formatWeekday(dayKey)}`}
            </Button>
          }
        />
      </div>
    </Subview>
  );
}

export default PlanMealSubview;
