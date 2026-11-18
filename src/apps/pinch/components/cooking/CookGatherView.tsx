import { RotateCcw } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import { PillGroup } from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import CookIngredientsView, {
  CookIngredientRow,
  type CookRow,
} from '@apps/pinch/components/cooking/CookIngredientsView';
import CookToolsStrip from '@apps/pinch/components/cooking/CookToolsStrip';
import { MAX_COOK_SERVINGS } from '@apps/pinch/constants';
import type { Recipe } from '@apps/pinch/types';
import { combineCookLines } from '@apps/pinch/utils/combineCookLines';
import { getConversionLine } from '@apps/pinch/utils/cookConversions';
import { stepCookServings } from '@apps/pinch/utils/cooks';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

export interface CookGatherDish {
  recipe: Recipe;
  rows: CookRow[];
  hasWrittenAmounts: boolean;
  servings: number;
  plannedServings: number | null;
  gotOut: Record<string, boolean>;
}

interface CookGatherViewProps {
  uid: string;
  dishes: CookGatherDish[];
  onServingsChange: (recipeId: string, servings: number) => void;
  onToggle: (recipeId: string, id: string, isOut: boolean) => void;
  onReset: (recipeId: string) => void;
}

type GatherLayout = 'PARTS' | 'ALL';

const parseLayout = (stored: unknown): GatherLayout | null =>
  stored === 'PARTS' || stored === 'ALL' ? stored : null;

function ServingsCard({
  dishes,
  onServingsChange,
}: Pick<CookGatherViewProps, 'dishes' | 'onServingsChange'>) {
  const isPlate = dishes.length > 1;
  const isPlanned = (dish: CookGatherDish) =>
    dish.plannedServings !== null && dish.plannedServings < dish.servings;
  const plans = new Set(
    dishes.map((dish) => (isPlanned(dish) ? dish.plannedServings : null)),
  );
  const sharedPlan =
    isPlate && plans.size === 1 ? (dishes[0].plannedServings ?? null) : null;
  const isPlanShared = sharedPlan !== null && isPlanned(dishes[0]);
  const renderStepper = (dish: CookGatherDish) => (
    <Stepper
      label={isPlate ? `${dish.recipe.title} servings` : 'Servings'}
      value={dish.servings}
      min={0}
      max={MAX_COOK_SERVINGS}
      step={1}
      onChange={(next) =>
        onServingsChange(
          dish.recipe.id,
          stepCookServings(dish.servings, next > dish.servings ? 1 : -1),
        )
      }
    />
  );
  return (
    <section
      aria-labelledby='cook-servings-heading'
      className='border-border space-y-3 rounded-xl border p-4'
    >
      <div className='flex items-center justify-between gap-3'>
        <h3 id='cook-servings-heading' className='text-lg font-medium'>
          <span className='min-[400px]:hidden'>Servings</span>
          <span className='max-[399px]:hidden'>How many servings?</span>
        </h3>
        {!isPlate && renderStepper(dishes[0])}
      </div>
      {dishes.map((dish) => {
        const isScaled =
          dish.recipe.servings > 0 && dish.servings !== dish.recipe.servings;
        const isPlanShown = isPlanned(dish) && !isPlanShared;
        if (!isPlate && !isScaled && !isPlanShown) return null;
        return (
          <div key={dish.recipe.id} className='space-y-1'>
            {isPlate && (
              <div className='flex items-center justify-between gap-3'>
                <p className='min-w-0 text-base wrap-break-word'>
                  {dish.recipe.title}
                </p>
                {renderStepper(dish)}
              </div>
            )}
            {isPlanShown && (
              <p className='text-muted-foreground text-sm'>
                You planned {dish.plannedServings} for tonight. The rest can be
                put away.
              </p>
            )}
            {isScaled && (
              <p className='text-muted-foreground text-xs'>
                Scaled from {formatServings(dish.recipe.servings)}.
                {dish.hasWrittenAmounts &&
                  ' Amounts written in the steps stay as they are.'}
              </p>
            )}
          </div>
        );
      })}
      {isPlanShared && (
        <p className='text-muted-foreground text-sm'>
          You planned {sharedPlan} of each for tonight. The rest can be put
          away.
        </p>
      )}
    </section>
  );
}

function AllTogetherList({
  dishes,
  onToggle,
  onReset,
}: Pick<CookGatherViewProps, 'dishes' | 'onToggle' | 'onReset'>) {
  const isPlate = dishes.length > 1;
  const lines = combineCookLines(
    dishes.flatMap((dish) =>
      dish.rows.map((row) => ({
        recipeId: dish.recipe.id,
        recipeTitle: dish.recipe.title,
        lineId: row.id,
        key: row.ingredientKey,
        name: row.name,
        note: row.note,
        amountText: row.amountText,
        isMeasured: row.isMeasured,
        group: row.group,
        measure: row.measure,
      })),
    ),
    isPlate,
  );
  const gotOutBy = new Map(dishes.map((dish) => [dish.recipe.id, dish.gotOut]));
  const isLineOut = (line: (typeof lines)[number]) =>
    line.sources.every(
      ({ recipeId, lineId }) => gotOutBy.get(recipeId)?.[lineId] === true,
    );
  const outCount = lines.filter(isLineOut).length;
  const byKey = new Map(lines.map((line) => [line.key, line]));
  const toggle = (key: string, isOut: boolean) =>
    byKey
      .get(key)
      ?.sources.forEach(({ recipeId, lineId }) =>
        onToggle(recipeId, lineId, isOut),
      );

  return (
    <div>
      <div className='flex h-10 items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {outCount === 0
            ? "Tick what you've got out · tap an amount for other units"
            : `${outCount} of ${lines.length} got out`}
        </p>
        {outCount > 0 && (
          <ActionChips
            actions={[
              {
                key: 'reset',
                icon: <RotateCcw className='h-4 w-4' />,
                label: 'Reset',
                onClick: () =>
                  dishes.forEach((dish) => onReset(dish.recipe.id)),
              },
            ]}
          />
        )}
      </div>
      <ul className='divide-border divide-y'>
        {lines.map((line) => {
          const conversion =
            line.measure === null ? null : getConversionLine(line.measure);
          return (
            <CookIngredientRow
              key={line.key}
              id={line.key}
              name={line.name}
              note={line.note}
              amountText={line.amountText}
              isMeasured={line.isMeasured}
              conversion={
                conversion === null
                  ? null
                  : { key: `all:${line.key}`, text: conversion }
              }
              isInStep={false}
              isOut={isLineOut(line)}
              onToggle={toggle}
            />
          );
        })}
      </ul>
    </div>
  );
}

function CookGatherView({
  uid,
  dishes,
  onServingsChange,
  onToggle,
  onReset,
}: CookGatherViewProps) {
  const isPlate = dishes.length > 1;
  const [storedLayout, setLayout] = useLocalStorageState<GatherLayout | null>(
    `pinch:${uid}:cook-gather-layout`,
    null,
    parseLayout,
  );
  const allRows = dishes.flatMap((dish) => dish.rows);
  const canCombine =
    isPlate ||
    new Set(allRows.map((row) => row.group)).size > 1 ||
    new Set(allRows.map((row) => row.ingredientKey)).size < allRows.length;
  const layout = canCombine ? (storedLayout ?? 'PARTS') : 'PARTS';

  return (
    <div className='mx-auto w-full max-w-2xl space-y-5 [@media(max-height:500px)_and_(min-width:640px)]:grid [@media(max-height:500px)_and_(min-width:640px)]:max-w-4xl [@media(max-height:500px)_and_(min-width:640px)]:grid-cols-2 [@media(max-height:500px)_and_(min-width:640px)]:items-start [@media(max-height:500px)_and_(min-width:640px)]:gap-6 [@media(max-height:500px)_and_(min-width:640px)]:space-y-0'>
      <div className='space-y-5'>
        <div className='space-y-1'>
          <h2 className='text-xl leading-snug font-medium min-[360px]:text-2xl'>
            Get your ingredients out
          </h2>
          <p className='text-muted-foreground text-sm [@media(max-height:640px)]:hidden'>
            Set everything out before the first step.
          </p>
        </div>
        <ServingsCard dishes={dishes} onServingsChange={onServingsChange} />
        <CookToolsStrip rows={allRows} />
      </div>
      <div className='space-y-2'>
        {canCombine && (
          <PillGroup
            label='How to list the ingredients'
            options={[
              { value: 'PARTS', label: isPlate ? 'By dish' : 'By part' },
              { value: 'ALL', label: 'All together' },
            ]}
            value={layout}
            onChange={setLayout}
            isThin
          />
        )}
        {layout === 'ALL' ? (
          <AllTogetherList
            dishes={dishes}
            onToggle={onToggle}
            onReset={onReset}
          />
        ) : (
          dishes.map((dish, index) => (
            <section
              key={dish.recipe.id}
              aria-label={isPlate ? dish.recipe.title : undefined}
              className='space-y-1'
            >
              {isPlate && (
                <h3 className='border-border border-t pt-4 text-lg font-medium'>
                  {dish.recipe.title}
                </h3>
              )}
              <CookIngredientsView
                recipe={dish.recipe}
                rows={dish.rows}
                stepLineIds={null}
                hasWrittenAmounts={dish.hasWrittenAmounts}
                servings={dish.servings}
                plannedServings={dish.plannedServings}
                gotOut={dish.gotOut}
                onServingsChange={(next) =>
                  onServingsChange(dish.recipe.id, next)
                }
                onToggle={(id, isOut) => onToggle(dish.recipe.id, id, isOut)}
                onReset={() => onReset(dish.recipe.id)}
                isServingsShown={false}
                isHintShown={index === 0}
                isToolsShown={false}
              />
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export default CookGatherView;
