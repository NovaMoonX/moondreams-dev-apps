import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ChefHat,
  CookingPot,
  History,
  PackagePlus,
  ShoppingBasket,
} from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import ClampedText from '@/components/ClampedText';
import DetailSheet from '@/components/DetailSheet';
import FormSection from '@/components/FormSection';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import StockRows from '@apps/pinch/components/containers/StockRows';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import RecipeCareSection from '@apps/pinch/components/recipes/RecipeCareSection';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import LeftOutTip from '@apps/pinch/components/shared/LeftOutTip';
import { SECTION_COUNT_THRESHOLD, UNIT_LABELS } from '@apps/pinch/constants';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectContainersLoadError,
  selectCookSummaries,
  selectCooksById,
  selectIngredientsById,
  selectIsContainersReady,
  selectNoteSummaries,
  selectNotesByRecipe,
  selectNotesLoadError,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectRecipesById,
  selectShowNutrition,
  selectSourcesById,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { Gap, GapKind, ShoppingRequest } from '@apps/pinch/types';
import { getCookServings, isCookHistoryFull } from '@apps/pinch/utils/cooks';
import { isBulkMeal } from '@apps/pinch/utils/containers';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { formatMinutes, formatServings } from '@apps/pinch/utils/recipeFormat';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NO_PRODUCT') return 'No price yet';
  if (kind === 'NOT_COMPARABLE') return "Can't compare with the package size";
  return null;
};

interface Fact {
  emoji: string;
  text: string;
  canWrap?: boolean;
  help?: ReactNode;
}

interface LatestNoteLineProps {
  recipeId: string;
  onOpen: () => void;
}

function LatestNoteLine({ recipeId, onOpen }: LatestNoteLineProps) {
  const notes = useAppSelector(selectNotesByRecipe).get(recipeId);
  const cooksById = useAppSelector(selectCooksById);
  const isReady = useAppSelector(
    (state) =>
      state.pinch.notes.isLoaded && selectNotesLoadError(state) === null,
  );
  const note = notes?.find((entry) => entry.kind === 'NOTE');
  const text = note?.text?.replace(/\s+/g, ' ').trim() ?? '';

  if (!isReady || !note || text === '') {
    return null;
  }

  const cook = note.cookId === null ? undefined : cooksById.get(note.cookId);
  const label = cook
    ? `Last time (${formatDateShort(cook.cookedAt)}):`
    : `Your note (${formatDateShort(note.createdAt)}):`;

  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={onOpen}
      className='text-muted-foreground! h-auto w-full justify-start rounded-none p-0 px-0! py-0! text-left text-sm font-normal whitespace-normal'
    >
      <span className='line-clamp-2 min-w-0 wrap-break-word'>
        <span aria-hidden='true'>📝</span>{' '}
        <span className='text-foreground font-medium'>{label}</span> {text}
      </span>
    </Button>
  );
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
  onOpenStock: (id: string) => void;
  onPutAway: (id: string) => void;
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
  onOpenStock,
  onPutAway,
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
  const isStockReady = useAppSelector(selectIsContainersReady);
  const stockError = useAppSelector(selectContainersLoadError);
  const hasStock = useAppSelector((state) =>
    selectStockByRecipe(state).has(recipeId),
  );
  const [markError, setMarkError] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  if (!recipe) {
    return null;
  }

  const isHistoryFull = isCookHistoryFull(cookSummary?.count ?? 0);
  const getMarkReason = () => {
    if (loadError !== null) return null;
    if (!isLoaded) return 'Loading your cooking history…';
    if (isHistoryFull) {
      return "This recipe's history is full. Delete an older cook to add more.";
    }
    return null;
  };
  const reasons = [
    getMarkReason(),
    stockError === null && !isStockReady
      ? 'Loading your prepared meals…'
      : null,
  ].filter((reason) => reason !== null);

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

  const care = getRecipeCare(recipe);
  const actions: ActionChip[] = [
    recipe.steps.length > 0 && {
      key: 'cook',
      icon: <CookingPot className='h-4 w-4' />,
      label: 'Start cooking',
      description: 'Start cooking: steps one at a time, with a timer',
      onClick: () => {
        onClose();
        openSubview({ kind: 'cook', recipeId: recipe.id });
      },
    },
    loadError === null && {
      key: 'cooked',
      icon: <ChefHat className='h-4 w-4' />,
      label: 'I cooked this',
      description: 'I cooked this: keeps a record you can change later',
      isDisabled: !isLoaded || isHistoryFull || isMarking,
      onClick: () => void handleMarkCooked(),
    },
    {
      key: 'shopping',
      icon: <ShoppingBasket className='h-4 w-4' />,
      label: 'Shopping list',
      description: 'Add to shopping list: choose what you need for this recipe',
      onClick: () => onAddToShopping({ kind: 'recipe', recipeId: recipe.id }),
    },
    stockError === null &&
      (cookSummary !== undefined ||
        isBulkMeal({ servings: recipe.servings, care, hasStock })) && {
        key: 'put-away',
        icon: <PackagePlus className='h-4 w-4' />,
        label: 'Put some away',
        description:
          'Put some away in the fridge or freezer, with an eat-by date',
        isDisabled: !isStockReady,
        onClick: () => onPutAway(recipe.id),
      },
    cookSummary !== undefined && {
      key: 'history',
      icon: <History className='h-4 w-4' />,
      label: 'History',
      description: 'Cooking history: fix a date or add one you missed',
      onClick: () => onOpenHistory(recipe.id),
    },
  ].filter((action) => action !== false);

  const source = getRecipeSource(recipe, sourcesById);
  const leftOutCount = cost ? countLeftOutIngredients(cost.leftOut) : 0;
  const isPriced = cost !== undefined && cost.totalCents !== null;
  const costHelp =
    isPriced && leftOutCount > 0 ? (
      <LeftOutTip
        leftOut={cost.leftOut}
        fix={
          leftOutCount === 1
            ? "It's marked in the ingredient list."
            : "They're marked in the ingredient list."
        }
      />
    ) : undefined;

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
    isPriced &&
      cost.perServingCents !== null && {
        emoji: '💰',
        text: `${formatCost(cost.perServingCents)}${leftOutCount > 0 ? '+' : ''} per serving`,
        help: costHelp,
      },
    source && { emoji: '📖', text: `From ${source.label}`, canWrap: true },
  ].filter((fact) => fact !== false && fact !== null);

  const getStatusText = () => {
    if (!cookSummary) return null;
    const made = `Last made ${formatDateShort(cookSummary.lastCookedAt)}`;
    if (lastTweakAt === null || lastTweakAt <= cookSummary.lastCookedAt) {
      return made;
    }
    return `${made} · changed ${formatDateShort(lastTweakAt)}`;
  };
  const statusText = getStatusText();
  const hasMacros =
    nutrition !== undefined && hasShownValue(nutrition.values, show);

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
        <div className='space-y-3'>
          {recipe.description && <ClampedText text={recipe.description} />}
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
                  {fact.help && (
                    <span className='ml-1 inline-flex align-middle'>
                      {fact.help}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {statusText && (
              <p className='text-muted-foreground text-sm'>
                <span aria-hidden='true'>✅</span> {statusText}
              </p>
            )}
            <StockRows
              target={{ kind: 'recipe', id: recipe.id }}
              onOpenStock={() => onOpenStock(recipe.id)}
            />
            <LatestNoteLine
              recipeId={recipe.id}
              onOpen={() =>
                notesRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
            />
          </div>
          <div className='space-y-1.5'>
            <ActionChips label='Recipe actions' actions={actions} />
            {reasons.map((reason) => (
              <p key={reason} className='text-muted-foreground text-xs'>
                {reason}
              </p>
            ))}
            {markError && (
              <p className='text-destructive text-sm' role='alert'>
                {markError}
              </p>
            )}
          </div>
        </div>

        <FormSection
          title='Ingredients'
          detail={
            recipe.ingredients.length > SECTION_COUNT_THRESHOLD
              ? recipe.ingredients.length
              : undefined
          }
        >
          <ul className='divide-border divide-y'>
            {recipe.ingredients.map((line) => {
              const gap = isPriced
                ? gapLabel(cost.lines.get(line.id)?.gap?.kind)
                : null;
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

        {cost && (
          <div className='space-y-3 empty:hidden'>
            {isPriced && (
              <StatTile
                label='Cost'
                value={
                  leftOutCount > 0
                    ? `${formatCost(cost.totalCents ?? 0)} so far`
                    : formatCost(cost.totalCents ?? 0)
                }
                detail={`For ${formatServings(recipe.servings)}`}
                help={costHelp}
              />
            )}
            {hasMacros && (
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
              lead={isPriced ? undefined : 'See what it costs:'}
              onFillIn={onFillIn}
            />
          </div>
        )}

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

        {care && <RecipeCareSection care={care} />}

        <div ref={notesRef} className='scroll-mt-4'>
          <RecipeNotes
            recipeId={recipe.id}
            onAdd={() => onOpenNote(recipe.id, null)}
            onEdit={(noteId) => onOpenNote(recipe.id, noteId)}
          />
        </div>
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
