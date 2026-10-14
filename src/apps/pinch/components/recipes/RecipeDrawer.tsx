import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChefHat, History } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import FormSection from '@/components/FormSection';
import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import StartCookingRow from '@apps/pinch/components/shared/StartCookingRow';
import { UNIT_LABELS } from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCookSummaries,
  selectIngredientsById,
  selectNoteSummaries,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectRecipesById,
  selectShowNutrition,
  selectSourcesById,
} from '@apps/pinch/store/selectors';
import type { Gap, GapKind, ShoppingRequest } from '@apps/pinch/types';
import {
  getCookFactText,
  getCookServings,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { formatMinutes, formatServings } from '@apps/pinch/utils/recipeFormat';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NOT_COMPARABLE')
    return "Can't compare this unit to the product's";
  return null;
};

interface Fact {
  emoji: string;
  text: string;
  canWrap?: boolean;
}

interface RecipeDrawerProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
  onPlan: (id: string) => void;
  onModify: (id: string) => void;
  onFillIn: (gaps: Gap[]) => void;
  onAddToShopping: (request: ShoppingRequest) => void;
  onOpenHistory: (id: string) => void;
  /** A null `noteId` starts a new note. */
  onOpenNote: (recipeId: string, noteId: string | null) => void;
}

function RecipeDrawer({
  uid,
  recipeId,
  onClose,
  onPlan,
  onModify,
  onFillIn,
  onAddToShopping,
  onOpenHistory,
  onOpenNote,
}: RecipeDrawerProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const cost = useAppSelector(selectRecipeCosts).get(recipeId);
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipeId);
  const show = useAppSelector(selectShowNutrition);
  const sourcesById = useAppSelector(selectSourcesById);
  const cookSummary = useAppSelector(selectCookSummaries).get(recipeId);
  const lastTweakAt =
    useAppSelector(selectNoteSummaries).get(recipeId)?.lastTweakAt ?? null;
  const { openSubview } = usePinchOverlay();
  const { isLoaded, loadError, markRecipeCooked } = useCookActions(uid);
  const [markError, setMarkError] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);

  if (!recipe) {
    return null;
  }

  const isHistoryFull = isCookHistoryFull(cookSummary?.count ?? 0);
  const getMarkSubtitle = () => {
    if (!isLoaded) return 'Loading your cooking history…';
    if (isHistoryFull) {
      return "This recipe's history is full. Delete an older cook to add more.";
    }
    return 'Keeps a record. You can change the date later.';
  };

  const handleMarkCooked = async () => {
    setMarkError(null);
    setIsMarking(true);
    try {
      await markRecipeCooked(recipe, getCookServings(recipe.servings));
    } catch (error) {
      setMarkError(getErrorMessage(error, 'Unable to mark this as cooked.'));
    } finally {
      setIsMarking(false);
    }
  };

  const source = getRecipeSource(recipe, sourcesById);

  const facts: Fact[] = [
    { emoji: '🍽️', text: formatServings(recipe.servings) },
    recipe.prepMinutes != null && {
      emoji: '🔪',
      text: `Prep ${formatMinutes(recipe.prepMinutes)}`,
    },
    recipe.cookMinutes != null && {
      emoji: '⏲️',
      text: `Cook ${formatMinutes(recipe.cookMinutes)}`,
    },
    source && { emoji: '📖', text: `From ${source.label}`, canWrap: true },
    lastTweakAt !== null && {
      emoji: '✏️',
      text: `Last tweaked ${formatDateShort(lastTweakAt)}`,
    },
  ].filter((fact) => fact !== false && fact !== null);
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
        <div className='space-y-1.5'>
          <ul className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
            {facts.map((fact) => (
              <li
                key={fact.text}
                className={join(
                  fact.canWrap
                    ? 'min-w-0 wrap-break-word'
                    : 'whitespace-nowrap',
                )}
              >
                <span aria-hidden='true'>{fact.emoji}</span> {fact.text}
              </li>
            ))}
          </ul>
          {cookSummary && (
            <p className='text-muted-foreground text-sm'>
              <span aria-hidden='true'>✅</span>{' '}
              {getCookFactText(
                cookSummary.count,
                formatDateShort(cookSummary.lastCookedAt),
              )}
            </p>
          )}
        </div>
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
                    title="What's left out"
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
                <p className='text-muted-foreground text-xs'>Per serving</p>
                <MacroStats
                  values={nutrition.values}
                  show={show}
                  variant='tiles'
                />
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

        <div className='space-y-2'>
          <ActionGroup>
            {recipe.steps.length > 0 && (
              <StartCookingRow
                isGrouped
                onClick={() => {
                  onClose();
                  openSubview({ kind: 'cook', recipeId: recipe.id });
                }}
              />
            )}
            {loadError === null && (
              <ActionRow
                isGrouped
                icon={<ChefHat className='h-4 w-4' />}
                label='I cooked this'
                subtitle={getMarkSubtitle()}
                isDisabled={!isLoaded || isHistoryFull || isMarking}
                onClick={() => void handleMarkCooked()}
              />
            )}
            <AddToShoppingRow
              isGrouped
              subtitle='Choose what you need for this recipe'
              onClick={() =>
                onAddToShopping({ kind: 'recipe', recipeId: recipe.id })
              }
            />
            {cookSummary && (
              <ActionRow
                isGrouped
                icon={<History className='h-4 w-4' />}
                label='Cooking history'
                subtitle='Fix a date or add one you missed'
                onClick={() => onOpenHistory(recipe.id)}
              />
            )}
          </ActionGroup>
          {markError && (
            <p className='text-destructive text-sm' role='alert'>
              {markError}
            </p>
          )}
        </div>

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

        <RecipeNotes
          recipeId={recipe.id}
          onAdd={() => onOpenNote(recipe.id, null)}
          onEdit={(noteId) => onOpenNote(recipe.id, noteId)}
        />
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
