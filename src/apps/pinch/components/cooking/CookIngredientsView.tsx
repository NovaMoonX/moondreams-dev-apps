import { memo, type ReactNode } from 'react';

import AppCheckbox from '@/components/AppCheckbox';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { RotateCcw } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import SectionDivider from '@/components/SectionDivider';
import Stepper from '@/components/Stepper';
import { MAX_COOK_SERVINGS } from '@apps/pinch/constants';
import {
  CookAmountButton,
  CookConversionLine,
} from '@apps/pinch/components/cooking/CookAmount';
import CookToolsStrip from '@apps/pinch/components/cooking/CookToolsStrip';
import type { Recipe } from '@apps/pinch/types';
import type { CookMeasure } from '@apps/pinch/utils/cookConversions';
import { stepCookServings } from '@apps/pinch/utils/cooks';
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

export interface CookRow {
  id: string;
  name: string;
  note: string | null;
  /** The scaled amount, or for a line with no amount its words ("to taste"), which never scales. */
  amountText: string;
  isMeasured: boolean;
  /** The heading it sits under in the list, or null. */
  group: string | null;
  /** The amount as shown, for a spoken conversion; null for a line with no amount. */
  measure: CookMeasure | null;
  /** The other units of the amount shown and the key that says which row is open, or null for a line with nothing to convert. */
  conversion: { key: string; text: string } | null;
  /** Its group again where it is shown away from its heading (a step), set only when its ingredient is in more than one group. */
  groupLabel: string | null;
  /** Poured rather than scooped, so a cup of it wants a liquid measuring cup. */
  isLiquid: boolean;
  /** The same ingredient on another line or dish, so "All together" can add them up. */
  ingredientKey: string;
}

export interface CookIngredientRowProps extends Omit<
  CookRow,
  'group' | 'groupLabel' | 'measure' | 'isLiquid' | 'ingredientKey'
> {
  isInStep: boolean;
  isOut: boolean;
  onToggle: (id: string, isOut: boolean) => void;
}

/** Props are plain values so a tick re-renders only its own row. */
export const CookIngredientRow = memo(function CookIngredientRow({
  id,
  name,
  note,
  amountText,
  isMeasured,
  conversion,
  isInStep,
  isOut,
  onToggle,
}: CookIngredientRowProps) {
  return (
    <li>
      <div
        className={join(
          'flex items-start gap-3 py-2.5',
          isInStep && 'bg-accent/60 -mx-2 rounded-lg px-2',
        )}
      >
        <label className='flex min-w-0 flex-1 cursor-pointer items-start gap-3'>
          <span className='mt-0.5 inline-flex shrink-0'>
            <AppCheckbox
              aria-label={`Got out ${name}`}
              isMark
              checked={isOut}
              onCheckedChange={(checked) => onToggle(id, checked === true)}
            />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-base wrap-break-word'>{name}</span>
            {note && (
              <span className='text-muted-foreground block text-xs wrap-break-word'>
                {note}
              </span>
            )}
          </span>
        </label>
        <CookAmountButton
          row={{ amountText, conversion }}
          className={join(
            'text-base',
            isMeasured
              ? 'shrink-0 font-medium whitespace-nowrap'
              : 'text-muted-foreground max-w-[50%] text-right wrap-break-word',
          )}
        />
      </div>
      <CookConversionLine row={{ conversion }} className='mb-2.5 ml-8' />
    </li>
  );
});

interface TickAllRowProps {
  /** What the box ticks, for a screen reader ("all of the sauce"). */
  label: string;
  doneCount: number;
  total: number;
  onToggleAll: (isOut: boolean) => void;
  /** Words beside the box in place of the count, such as the first hint. */
  text?: string;
  trailing?: ReactNode;
}

/** One box over a list of ingredients that ticks or unticks them all, partly ticked while some are, lined up with the rows' own boxes. */
export function TickAllRow({
  label,
  doneCount,
  total,
  onToggleAll,
  text,
  trailing,
}: TickAllRowProps) {
  return (
    <div className='flex min-h-10 items-center justify-between gap-3'>
      <label className='flex min-w-0 cursor-pointer items-center gap-3'>
        <span className='inline-flex shrink-0'>
          <AppCheckbox
            aria-label={`Got out ${label}`}
            isMark
            checked={total > 0 && doneCount === total}
            indeterminate={doneCount > 0 && doneCount < total}
            onCheckedChange={onToggleAll}
          />
        </span>
        <span className='text-muted-foreground text-sm'>
          {text ?? `${doneCount} of ${total} got out`}
        </span>
      </label>
      {trailing}
    </div>
  );
}

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
  /** Off where the screen draws servings itself (the first screen's servings card). */
  isServingsShown?: boolean;
  /** Off for every dish but the first on a plate, so "Tick what you've got out" is said once. */
  isHintShown?: boolean;
  /** Off where the screen draws one strip for every dish. */
  isToolsShown?: boolean;
  /** A box over the whole list, and over each part when there are several, that ticks them all at once. */
  isTickAllShown?: boolean;
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
  isServingsShown = true,
  isHintShown = true,
  isToolsShown = true,
  isTickAllShown = false,
}: CookIngredientsViewProps) {
  const outCount = rows.filter((row) => gotOut[row.id]).length;
  const groups = groupIngredientLines(rows);
  const toggleAll = (lines: CookRow[], isOut: boolean) =>
    lines.forEach((row) => onToggle(row.id, isOut));
  const hintText = `${
    outCount === 0
      ? "Tick what you've got out"
      : `${outCount} of ${rows.length} got out`
  }${
    isHintShown && rows.some((row) => row.conversion !== null)
      ? ' · tap an amount for other units'
      : ''
  }`;
  const resetChip =
    outCount > 0 ? (
      <ActionChips
        actions={[
          {
            key: 'reset',
            icon: <RotateCcw className='h-4 w-4' />,
            label: 'Reset',
            onClick: onReset,
          },
        ]}
      />
    ) : null;
  const isScaled = recipe.servings > 0 && servings !== recipe.servings;

  return (
    <div className='space-y-4'>
      {isServingsShown && (
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
              You planned {plannedServings} for tonight. The rest can be put
              away.
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
      )}
      {isToolsShown && <CookToolsStrip rows={rows} />}
      {rows.length === 0 ? (
        <p className='text-muted-foreground py-2 text-center text-sm'>
          This recipe has no ingredients yet.
        </p>
      ) : (
        <div>
          {isTickAllShown ? (
            <TickAllRow
              label={`all of ${recipe.title}`}
              doneCount={outCount}
              total={rows.length}
              onToggleAll={(isOut) => toggleAll(rows, isOut)}
              text={hintText}
              trailing={resetChip}
            />
          ) : (
            (isHintShown || outCount > 0) && (
              <div className='flex h-10 items-center justify-between gap-3'>
                <p className='text-muted-foreground text-sm'>{hintText}</p>
                {resetChip}
              </div>
            )
          )}
          {groups.map((group) => (
            <div key={group.key}>
              {group.name !== null && (
                <SectionDivider label={group.name} className='pt-3 pb-1' />
              )}
              {isTickAllShown && group.name !== null && groups.length > 1 && (
                <TickAllRow
                  label={`all of ${group.name}`}
                  doneCount={
                    group.lines.filter((row) => gotOut[row.id] === true).length
                  }
                  total={group.lines.length}
                  onToggleAll={(isOut) => toggleAll(group.lines, isOut)}
                />
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
                    conversion={row.conversion}
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
