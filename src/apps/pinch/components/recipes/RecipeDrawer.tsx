import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  CalendarPlus,
  ChevronLeft,
  CircleCheck,
  CookingPot,
  Ellipsis,
  History,
  PackagePlus,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import ClampedText from '@/components/ClampedText';
import DetailSheet from '@/components/DetailSheet';
import FactsLine, { type Fact } from '@/components/FactsLine';
import FormSection from '@/components/FormSection';
import GroupRow from '@/components/GroupRow';
import MacroStats from '@/components/MacroStats';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import TickMark from '@/components/TickMark';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import StockRows from '@apps/pinch/components/containers/StockRows';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import RecipeCareSection from '@apps/pinch/components/recipes/RecipeCareSection';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
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
  selectPlannedByDay,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectRecipesById,
  selectShowNutrition,
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
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NO_PRODUCT') return 'No price yet';
  if (kind === 'NOT_COMPARABLE') return "Can't compare with the package size";
  return null;
};

type DrawerView = 'recipe' | 'photo' | 'history' | 'more';

interface BackLinkProps {
  onBack: () => void;
}

function BackLink({ onBack }: BackLinkProps) {
  useBackStep(true, onBack);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 px-0!'
      onClick={onBack}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      Back
    </Button>
  );
}

interface DoorButtonProps {
  label: string;
  icon: ReactNode;
  isOpen: boolean;
  variant?: 'tertiary' | 'secondary';
  onClick: (opener: HTMLElement) => void;
}

function DoorButton({
  label,
  icon,
  isOpen,
  variant = 'tertiary',
  onClick,
}: DoorButtonProps) {
  return (
    <Button
      type='button'
      variant={variant}
      size='icon'
      aria-label={label}
      title={label}
      aria-expanded={isOpen}
      onClick={(event) => onClick(event.currentTarget)}
      className={join(
        'text-foreground! size-10 min-w-10 shrink-0 p-0',
        isOpen && 'bg-accent!',
      )}
    >
      {icon}
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
  const [view, setView] = useState<DrawerView>('recipe');
  const openerRef = useRef<HTMLElement | null>(null);
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

  const openView = (next: DrawerView, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setView((current) => (current === next ? 'recipe' : next));
  };
  const backToRecipe = () => {
    setView('recipe');
    window.requestAnimationFrame(() => {
      if (openerRef.current?.isConnected) openerRef.current.focus();
    });
  };

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
  const canPutAway =
    stockError === null &&
    (cookSummary !== undefined ||
      isBulkMeal({ servings: recipe.servings, care, hasStock }));

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
      ? { lead: 'Cooked once,', when: `on ${day}` }
      : { lead: `Cooked ${cookSummary.count} times,`, when: `last ${day}` };
  };
  const cookedText = getCookedText();
  const hasMacros =
    nutrition !== undefined && hasShownValue(nutrition.values, show);

  const getViewBody = () => {
    if (view === 'photo') {
      return (
        <div className='space-y-3'>
          <BackLink onBack={backToRecipe} />
          <CoverImage
            coverPath={recipe.coverPath}
            version={recipe.updatedAt}
            className='w-full'
          />
        </div>
      );
    }
    if (view === 'history') {
      return (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <BackLink onBack={backToRecipe} />
            <p className='font-medium'>Notes and history</p>
          </div>
          {cookedText && (
            <ActionGroup>
              <GroupRow
                icon={<TickMark />}
                ariaLabel={`${cookedText.lead} ${cookedText.when}. Cooking history`}
                onClick={() => onOpenHistory(recipe.id)}
              >
                {cookedText.lead}{' '}
                <span className='whitespace-nowrap'>{cookedText.when}</span>
              </GroupRow>
            </ActionGroup>
          )}
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
      );
    }
    if (view === 'more') {
      return (
        <div className='space-y-3'>
          <BackLink onBack={backToRecipe} />
          <ActionGroup>
            <StockRows
              target={{ kind: 'recipe', id: recipe.id }}
              onOpenStock={() => onOpenStock(recipe.id)}
            />
          </ActionGroup>
          <ActionGroup>
            {cookPlan === null && recipe.steps.length > 0 && (
              <ActionRow
                isGrouped
                icon={<CookingPot className='h-4 w-4' />}
                label='Start cooking'
                subtitle='Steps one at a time, with a timer'
                onClick={startCooking}
              />
            )}
            {cookPlan !== null && (
              <ActionRow
                isGrouped
                icon={<CalendarPlus className='h-4 w-4' />}
                label='Plan it'
                subtitle='On another day'
                onClick={() => onPlan(recipe.id)}
              />
            )}
            {loadError === null && (
              <ActionRow
                isGrouped
                icon={<CircleCheck className='h-4 w-4' />}
                label='Mark as cooked'
                subtitle='Keeps a record you can change later'
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
            {canPutAway && (
              <ActionRow
                isGrouped
                icon={<PackagePlus className='h-4 w-4' />}
                label='Put some away'
                subtitle='In the fridge or freezer, with an eat-by date'
                isDisabled={!isStockReady}
                onClick={() => onPutAway(recipe.id)}
              />
            )}
          </ActionGroup>
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
      );
    }
    return null;
  };
  const viewBody = getViewBody();
  const shownView = viewBody === null ? 'recipe' : view;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={recipe.title}
      viewKey={shownView}
      actions={
        <DoorButton
          label='Notes and history'
          icon={<History className='h-5 w-5' aria-hidden='true' />}
          isOpen={shownView === 'history'}
          onClick={(opener) => openView('history', opener)}
        />
      }
      footer={
        <div className='flex gap-2 px-4 pb-4'>
          <Button
            type='button'
            variant='secondary'
            className='shrink-0 max-sm:px-3'
            onClick={() => onModify(recipe.id)}
          >
            Modify
          </Button>
          <DoorButton
            label='More for this recipe'
            icon={<Ellipsis className='h-5 w-5' aria-hidden='true' />}
            isOpen={shownView === 'more'}
            variant='secondary'
            onClick={(opener) => openView('more', opener)}
          />
          <Button
            type='button'
            className='min-w-0 flex-1 whitespace-nowrap max-sm:px-3'
            onClick={cookPlan ? startCooking : () => onPlan(recipe.id)}
          >
            {cookPlan ? 'Start cooking' : 'Plan it'}
          </Button>
        </div>
      }
    >
      {viewBody}
      <div className={join('space-y-5', viewBody !== null && 'hidden')}>
        {(recipe.coverPath || recipe.description || facts.length > 0) && (
          <div className='flex items-start gap-3'>
            {recipe.coverPath && (
              <Button
                type='button'
                variant='tertiary'
                size='stripped'
                aria-label='Show the photo'
                onClick={(event) => openView('photo', event.currentTarget)}
                className='shrink-0 rounded-xl p-0'
              >
                <CoverImage
                  coverPath={recipe.coverPath}
                  version={recipe.updatedAt}
                  size={64}
                />
              </Button>
            )}
            <div className='min-w-0 flex-1 space-y-1'>
              {recipe.description && (
                <ClampedText text={recipe.description} maxLines={2} />
              )}
              <FactsLine
                facts={facts}
                className='text-muted-foreground text-sm'
              />
            </div>
          </div>
        )}

        <FormSection
          title='Ingredients'
          detail={
            recipe.ingredients.length > SECTION_COUNT_THRESHOLD
              ? recipe.ingredients.length
              : undefined
          }
        >
          {groupIngredientLines(recipe.ingredients).map((group) => (
            <div key={group.key}>
              {group.name !== null && (
                <SectionDivider label={group.name} className='pt-3 pb-1' />
              )}
              <ul className='divide-border divide-y'>
                {group.lines.map((line) => {
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
                        {line.note && line.amount !== null && (
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
                      {line.amount === null ? (
                        line.note && (
                          <span className='text-muted-foreground max-w-[50%] text-right text-sm wrap-break-word'>
                            {line.note}
                          </span>
                        )
                      ) : (
                        <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                          {Math.round(line.amount * 100) / 100}{' '}
                          {UNIT_LABELS[line.unit]}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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

        {care && <RecipeCareSection care={care} />}

        {(isPriced || hasMacros || cost) && (
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
            {cost && (
              <GapNudge
                uid={uid}
                gaps={[
                  ...cost.leftOut,
                  ...getNutritionGaps(nutrition?.missing ?? [], show),
                ]}
                lead={isPriced ? undefined : 'See what it costs:'}
                onFillIn={onFillIn}
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
          </div>
        )}
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
