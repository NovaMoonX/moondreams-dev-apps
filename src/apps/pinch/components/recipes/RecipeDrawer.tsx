import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CalendarPlus,
  CircleCheck,
  CookingPot,
  PackagePlus,
  ShoppingBasket,
} from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import ActionGroup from '@/components/ActionGroup';
import ClampedText from '@/components/ClampedText';
import DetailSheet from '@/components/DetailSheet';
import FactsLine, { type Fact } from '@/components/FactsLine';
import FormSection from '@/components/FormSection';
import GroupRow from '@/components/GroupRow';
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
  selectNotesByRecipe,
  selectNotesLoadError,
  selectPlannedByDay,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectRecipesById,
  selectShowNutrition,
  selectSourcesById,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { Gap, GapKind, ShoppingRequest } from '@apps/pinch/types';
import {
  getCookId,
  getCookServings,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { isBulkMeal } from '@apps/pinch/utils/containers';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NO_PRODUCT') return 'No price yet';
  if (kind === 'NOT_COMPARABLE') return "Can't compare with the package size";
  return null;
};

interface LatestNoteRowProps {
  recipeId: string;
  onOpen: () => void;
}

function LatestNoteRow({ recipeId, onOpen }: LatestNoteRowProps) {
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

  const label =
    note.cookId !== null && cooksById.has(note.cookId)
      ? 'Last time:'
      : 'Your note:';

  return (
    <GroupRow icon='📝' onClick={onOpen}>
      <span className='line-clamp-2 wrap-break-word'>
        <span className='font-medium'>{label}</span>{' '}
        <span className='text-muted-foreground'>{text}</span>
      </span>
    </GroupRow>
  );
}

interface RecipeDrawerProps {
  uid: string;
  recipeId: string;
  onClose: () => void;
  /** Shows the recipes that share this source. */
  onOpenSource: (sourceId: string) => void;
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
  onOpenSource,
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
  const [todayKey] = useState(() => getCellDayKey(new Date()));
  const tonight = useAppSelector((state) => {
    const cooksById = selectCooksById(state);
    const meal = (selectPlannedByDay(state).get(todayKey) ?? []).find(
      (planned) =>
        !cooksById.has(getCookId(planned.id, recipeId)) &&
        planned.items.some(
          (item) => item.kind === 'RECIPE' && item.refId === recipeId,
        ),
    );
    const item = meal?.items.find(
      (entry) => entry.kind === 'RECIPE' && entry.refId === recipeId,
    );
    return meal && item ? `${meal.id}|${item.servings}` : null;
  });

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
      ? 'Loading your fridge and freezer…'
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
  const getCookPlan = () => {
    if (tonight === null || recipe.steps.length === 0) return null;
    const [plannedMealId, servings] = tonight.split('|');
    return { plannedMealId, servings: Number(servings) };
  };
  const cookPlan = getCookPlan();
  const startCooking = () => {
    onClose();
    openSubview(
      cookPlan
        ? { kind: 'cook', recipeId: recipe.id, ...cookPlan }
        : { kind: 'cook', recipeId: recipe.id },
    );
  };
  const actions: ActionChip[] = [
    cookPlan !== null && {
      key: 'plan',
      icon: <CalendarPlus className='h-4 w-4' />,
      label: 'Plan it',
      description: 'Plan it on another day',
      onClick: () => onPlan(recipe.id),
    },
    cookPlan === null &&
      recipe.steps.length > 0 && {
        key: 'cook',
        icon: <CookingPot className='h-4 w-4' />,
        label: 'Start cooking',
        description: 'Start cooking: steps one at a time, with a timer',
        onClick: startCooking,
      },
    loadError === null && {
      key: 'cooked',
      icon: <CircleCheck className='h-4 w-4' />,
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

  const totalMinutes = getTotalMinutes(recipe);
  const facts: Fact[] = [
    { key: 'servings', content: formatServings(recipe.servings) },
    totalMinutes !== null && {
      key: 'time',
      content: formatMinutes(totalMinutes),
    },
    isPriced &&
      cost.perServingCents !== null && {
        key: 'cost',
        content: (
          <>
            {`${formatCost(cost.perServingCents)}${leftOutCount > 0 ? '+' : ''} per serving`}
            {costHelp && (
              <span className='ml-1 inline-flex align-middle'>{costHelp}</span>
            )}
          </>
        ),
      },
  ].filter((fact) => fact !== false);

  const getCookedText = () => {
    if (!cookSummary) return null;
    const day = formatDateShort(cookSummary.lastCookedAt);
    return cookSummary.count === 1
      ? `Cooked once, on ${day}`
      : `Cooked ${cookSummary.count} times, last ${day}`;
  };
  const cookedText = getCookedText();
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
            onClick={cookPlan ? startCooking : () => onPlan(recipe.id)}
          >
            {cookPlan ? 'Start cooking' : 'Plan it'}
          </Button>
        </div>
      }
    >
      <div className='space-y-5'>
        <div className='space-y-2.5'>
          <div className='space-y-1.5 empty:hidden'>
            {source && (
              <Button
                type='button'
                variant='tertiary'
                size='stripped'
                aria-label={`From ${source.label}: show its recipes`}
                onClick={() => onOpenSource(source.id)}
                className="text-muted-foreground! relative flex! max-w-full text-left text-sm font-normal whitespace-normal after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] max-sm:-mt-3"
              >
                <span className='decoration-muted-foreground/50 underline underline-offset-4'>
                  From {source.label}
                </span>
              </Button>
            )}
            {recipe.coverPath && (
              <CoverImage
                coverPath={recipe.coverPath}
                version={recipe.updatedAt}
                className='h-40 w-full'
              />
            )}
            {recipe.description && (
              <ClampedText text={recipe.description} maxLines={2} />
            )}
          </div>
          <FactsLine facts={facts} className='text-muted-foreground text-sm' />
          <ActionGroup>
            {cookedText && (
              <GroupRow
                icon='✅'
                ariaLabel={`${cookedText}. Cooking history`}
                onClick={() => onOpenHistory(recipe.id)}
              >
                {cookedText}
              </GroupRow>
            )}
            <StockRows
              target={{ kind: 'recipe', id: recipe.id }}
              onOpenStock={() => onOpenStock(recipe.id)}
            />
            <LatestNoteRow
              recipeId={recipe.id}
              onOpen={() =>
                notesRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
            />
          </ActionGroup>
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
            onApply={(noteId) => {
              onClose();
              openSubview({
                kind: 'recipe',
                id: recipe.id,
                fromNoteId: noteId,
              });
            }}
          />
        </div>
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
