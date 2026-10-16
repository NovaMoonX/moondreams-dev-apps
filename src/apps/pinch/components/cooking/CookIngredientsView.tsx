import { memo } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';
import Stepper from '@/components/Stepper';
import { MAX_COOK_SERVINGS } from '@apps/pinch/constants';
import type { Recipe } from '@apps/pinch/types';
import { stepCookServings } from '@apps/pinch/utils/cooks';
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

export interface CookRow {
  id: string;
  name: string;
  note: string | null;
  /** The scaled amount, or for a line with no amount its note ("to taste"), which never scales. */
  amountText: string;
  isMeasured: boolean;
  /** The heading it sits under in the list, or null. */
  group: string | null;
  /** Its group again where it is shown away from its heading (a step), set only when its ingredient is in more than one group. */
  groupLabel: string | null;
}

interface CookIngredientRowProps extends Omit<CookRow, 'group' | 'groupLabel'> {
  isInStep: boolean;
  isOut: boolean;
  onToggle: (id: string, isOut: boolean) => void;
}

/** Props are plain values so a tick re-renders only its own row. */
const CookIngredientRow = memo(function CookIngredientRow({
  id,
  name,
  note,
  amountText,
  isMeasured,
  isInStep,
  isOut,
  onToggle,
}: CookIngredientRowProps) {
  return (
    <li>
      <label
        className={join(
          'flex cursor-pointer items-start gap-3 py-2.5',
          isInStep && 'bg-accent/60 -mx-2 rounded-lg px-2',
        )}
      >
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
            'text-base',
            isMeasured
              ? 'shrink-0 font-medium whitespace-nowrap'
              : 'text-muted-foreground max-w-[50%] text-right wrap-break-word',
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
  rows: CookRow[];
  /** The lines the step on screen names, marked in the list when it sits beside the steps. */
  stepLineIds: string[] | null;
  /** Some step writes an amount of its own, which scaling leaves as it is. */
  hasWrittenAmounts: boolean;
  servings: number;
  plannedServings: number | null;
  gotOut: Record<string, boolean>;
  onServingsChange: (servings: number) => void;
  onToggle: (id: string, isOut: boolean) => void;
  onReset: () => void;
}

function CookIngredientsView({
  recipe,
  rows,
  stepLineIds,
  hasWrittenAmounts,
  servings,
  plannedServings,
  gotOut,
  onServingsChange,
  onToggle,
  onReset,
}: CookIngredientsViewProps) {
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
            Scaled from {formatServings(recipe.servings)}.
            {hasWrittenAmounts &&
              ' Amounts written in the steps stay as they are.'}
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
          {groupIngredientLines(rows).map((group) => (
            <div key={group.key}>
              {group.name !== null && (
                <SectionDivider label={group.name} className='pt-3 pb-1' />
              )}
              <ul className='divide-border divide-y'>
                {group.lines.map((row) => (
                  <CookIngredientRow
                    key={row.id}
                    id={row.id}
                    name={row.name}
                    note={row.note}
                    amountText={row.amountText}
                    isMeasured={row.isMeasured}
                    isInStep={stepLineIds?.includes(row.id) ?? false}
                    isOut={gotOut[row.id] === true}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CookIngredientsView;
