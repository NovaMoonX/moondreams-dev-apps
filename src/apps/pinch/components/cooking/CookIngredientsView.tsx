import { memo, useMemo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import Stepper from '@/components/Stepper';
import { useAppSelector } from '@/store';
import { MAX_COOK_SERVINGS } from '@apps/pinch/constants';
import { selectIngredientsById } from '@apps/pinch/store/selectors';
import type { Recipe } from '@apps/pinch/types';
import { stepCookServings } from '@apps/pinch/utils/cooks';
import { formatKitchenAmount } from '@apps/pinch/utils/kitchenMeasure';
import { scaleAmount } from '@apps/pinch/utils/quantity';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface CookIngredientRowProps {
  id: string;
  name: string;
  note: string | null;
  amountText: string;
  isOut: boolean;
  onToggle: (id: string, isOut: boolean) => void;
}

/** Props are plain values so a tick re-renders only its own row. */
const CookIngredientRow = memo(function CookIngredientRow({
  id,
  name,
  note,
  amountText,
  isOut,
  onToggle,
}: CookIngredientRowProps) {
  return (
    <li>
      <label className='flex cursor-pointer items-start gap-3 py-2.5'>
        <span className='mt-0.5 inline-flex shrink-0'>
          <Checkbox
            aria-label={`Got out ${name}`}
            checked={isOut}
            onCheckedChange={(checked) => onToggle(id, checked === true)}
            className="relative after:absolute after:-inset-2.5 after:content-['']"
          />
        </span>
        <span className='min-w-0 flex-1'>
          <span
            className={join(
              'block text-base wrap-break-word',
              isOut && 'text-muted-foreground line-through',
            )}
          >
            {name}
          </span>
          {note && (
            <span className='text-muted-foreground block text-xs wrap-break-word'>
              {note}
            </span>
          )}
        </span>
        <span
          className={join(
            'shrink-0 text-base font-medium whitespace-nowrap',
            isOut && 'text-muted-foreground line-through',
          )}
        >
          {amountText}
        </span>
      </label>
    </li>
  );
});

interface CookIngredientsViewProps {
  recipe: Recipe;
  servings: number;
  plannedServings: number | null;
  gotOut: Record<string, boolean>;
  onServingsChange: (servings: number) => void;
  onToggle: (id: string, isOut: boolean) => void;
  onReset: () => void;
}

function CookIngredientsView({
  recipe,
  servings,
  plannedServings,
  gotOut,
  onServingsChange,
  onToggle,
  onReset,
}: CookIngredientsViewProps) {
  const ingredientsById = useAppSelector(selectIngredientsById);

  const rows = useMemo(
    () =>
      recipe.ingredients.map((line) => ({
        id: line.id,
        name:
          ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient',
        note: line.note,
        amountText: formatKitchenAmount(
          scaleAmount(line.amount, servings, recipe.servings),
          line.unit,
        ),
      })),
    [recipe.ingredients, recipe.servings, ingredientsById, servings],
  );
  const outCount = rows.filter((row) => gotOut[row.id]).length;
  const isScaled = recipe.servings > 0 && servings !== recipe.servings;

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
          <p className='text-lg font-medium'>
            Making {formatServings(servings)}
          </p>
          <Stepper
            label='Servings'
            value={servings}
            min={0}
            max={MAX_COOK_SERVINGS}
            step={1}
            onChange={(next) =>
              onServingsChange(
                stepCookServings(servings, next > servings ? 1 : -1),
              )
            }
          />
        </div>
        {plannedServings !== null && plannedServings < servings && (
          <p className='text-muted-foreground text-sm'>
            You planned {plannedServings} for tonight. The rest can be put away.
          </p>
        )}
        {isScaled && (
          <p className='text-muted-foreground text-xs'>
            Scaled from {formatServings(recipe.servings)}. Amounts written in
            the steps stay as they are.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className='text-muted-foreground py-2 text-center text-sm'>
          This recipe has no ingredients yet.
        </p>
      ) : (
        <div>
          <div className='flex h-10 items-center justify-between gap-3'>
            <p className='text-muted-foreground text-sm'>
              {outCount === 0
                ? "Tick what you've got out"
                : `${outCount} of ${rows.length} got out`}
            </p>
            {outCount > 0 && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-10 px-0!'
                onClick={onReset}
              >
                Reset
              </Button>
            )}
          </div>
          <ul className='divide-border divide-y'>
            {rows.map((row) => (
              <CookIngredientRow
                key={row.id}
                {...row}
                isOut={gotOut[row.id] === true}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CookIngredientsView;
