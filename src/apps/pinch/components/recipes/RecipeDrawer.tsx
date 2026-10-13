import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import FormSection from '@/components/FormSection';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import { UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectIngredientsById,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap, GapKind } from '@apps/pinch/types';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { formatMinutes, formatServings } from '@apps/pinch/utils/recipeFormat';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NOT_COMPARABLE')
    return "Can't compare this unit to the product's";
  return null;
};

interface RecipeDrawerProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
  onFillIn: (gaps: Gap[]) => void;
}

function RecipeDrawer({
  uid,
  recipeId,
  onClose,
  onPlan,
  onModify,
  onFillIn,
}: RecipeDrawerProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const cost = useAppSelector(selectRecipeCosts).get(recipeId);
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipeId);
  const show = useAppSelector(selectShowNutrition);

  if (!recipe) {
    return null;
  }

  const facts = [
    { emoji: '🍽️', text: formatServings(recipe.servings) },
    recipe.prepMinutes != null && {
      emoji: '🔪',
      text: `Prep ${formatMinutes(recipe.prepMinutes)}`,
    },
    recipe.cookMinutes != null && {
      emoji: '⏲️',
      text: `Cook ${formatMinutes(recipe.cookMinutes)}`,
    },
  ].filter((fact) => fact !== false);
  const leftOutCount = cost ? countLeftOutIngredients(cost.leftOut) : 0;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={recipe.title}
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0'
            onClick={() => onModify(recipe.id)}
          >
            Modify
          </Button>
          <Button
            type='button'
            className='min-w-0 flex-1'
            onClick={() => onPlan(recipe.id)}
          >
            Add to calendar
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        {recipe.coverPath && (
          <CoverImage
            coverPath={recipe.coverPath}
            version={recipe.updatedAt}
            className='h-40 w-full'
          />
        )}
        <ul className='flex flex-wrap gap-2'>
          {facts.map((fact) => (
            <li
              key={fact.text}
              className='bg-accent text-accent-foreground flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium'
            >
              <span aria-hidden='true'>{fact.emoji}</span>
              {fact.text}
            </li>
          ))}
        </ul>
        {cost && (
          <div className='space-y-3'>
            <StatTile
              label='Cost'
              value={
                cost.totalCents === null ? '—' : formatCost(cost.totalCents)
              }
              detail={
                cost.totalCents === null
                  ? 'No prices yet'
                  : `${formatCost(cost.perServingCents ?? 0)} per serving`
              }
              help={
                leftOutCount > 0 && cost.totalCents !== null ? (
                  <HelpTip
                    variant='warning'
                    title='Not everything is counted'
                    noModal
                    placement='top'
                  >
                    This {formatLeftOut(cost.leftOut)} because there’s no price
                    for {leftOutCount === 1 ? 'it' : 'them'} yet.
                  </HelpTip>
                ) : undefined
              }
            />
            {nutrition && hasShownValue(nutrition.values, show) && (
              <div className='space-y-1.5'>
                <MacroStats
                  values={nutrition.values}
                  show={show}
                  variant='tiles'
                />
                <p className='text-muted-foreground text-xs'>Per serving</p>
              </div>
            )}
            <GapNudge
              uid={uid}
              gaps={[
                ...cost.leftOut,
                ...getNutritionGaps(nutrition?.missing ?? [], show),
              ]}
              onFillIn={onFillIn}
            />
          </div>
        )}
        {recipe.description && (
          <p className='text-sm whitespace-pre-wrap'>{recipe.description}</p>
        )}

        <FormSection title='Ingredients' detail={recipe.ingredients.length}>
          <ul className='divide-border divide-y'>
            {recipe.ingredients.map((line) => {
              const gap = gapLabel(cost?.lines.get(line.id)?.gap?.kind);
              return (
                <li
                  key={line.id}
                  className='flex items-baseline justify-between gap-3 py-2'
                >
                  <span className='min-w-0'>
                    {ingredientsById.get(line.ingredientId)?.name ??
                      'Removed ingredient'}
                    {line.note && (
                      <span className='text-muted-foreground block text-xs'>
                        {line.note}
                      </span>
                    )}
                    {gap && (
                      <span className='text-muted-foreground block text-xs'>
                        {gap}
                      </span>
                    )}
                  </span>
                  <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                    {Math.round(line.amount * 100) / 100}{' '}
                    {UNIT_LABELS[line.unit]}
                  </span>
                </li>
              );
            })}
          </ul>
        </FormSection>

        {recipe.steps.length > 0 && (
          <FormSection title='Steps'>
            <ol className='space-y-3'>
              {recipe.steps.map((step, index) => (
                <li key={index} className='flex gap-3 text-sm'>
                  <span className='bg-accent text-accent-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                    {index + 1}
                  </span>
                  <span className='min-w-0 whitespace-pre-wrap'>{step}</span>
                </li>
              ))}
            </ol>
          </FormSection>
        )}
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
