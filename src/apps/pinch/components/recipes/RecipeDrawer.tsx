import { useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  CalendarPlus,
  CircleCheck,
  CookingPot,
  Ellipsis,
  History,
  PackagePlus,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import GroupRow from '@/components/GroupRow';
import StarButton from '@/components/StarButton';
import TickMark from '@/components/TickMark';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import StockRows from '@apps/pinch/components/containers/StockRows';
import RecipeNotes from '@apps/pinch/components/notes/RecipeNotes';
import RecipeFront from '@apps/pinch/components/recipes/RecipeFront';
import ShareDoorRow from '@apps/pinch/components/share/ShareDoorRow';
import ShareView from '@apps/pinch/components/share/ShareView';
import AddToShoppingRow from '@apps/pinch/components/shared/AddToShoppingRow';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import { useCookActions } from '@apps/pinch/hooks/useCookActions';
import { useRecipeFavorite } from '@apps/pinch/hooks/useRecipeFavorite';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCollections,
  selectContainersLoadError,
  selectCookSummaries,
  selectCooksById,
  selectIsContainersReady,
  selectPlannedByDay,
  selectRecipes,
  selectRecipesById,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type {
  Collection,
  ContainerPlace,
  Gap,
  ShoppingRequest,
} from '@apps/pinch/types';
import {
  getCollectionsPill,
  getRecipeCollections,
} from '@apps/pinch/utils/collections';
import {
  getCookId,
  getCookServings,
  isCookHistoryFull,
} from '@apps/pinch/utils/cooks';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { isBulkMeal } from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { isStarred } from '@apps/pinch/utils/favorites';
import { joinSourceNames } from '@apps/pinch/utils/shopping';

type DrawerView =
  'recipe' | 'photo' | 'history' | 'more' | 'collections' | 'share';

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

const COLLECTION_NAMES_SHOWN = 2;

interface CollectionRowsProps {
  recipeId: string;
  collections: Collection[];
  /** A row opens its collection only while the collection holds other recipes and a recipe list sits under the drawer; otherwise it only says what the collection holds. */
  onShow?: (collectionId: string) => void;
}

function CollectionRows({
  recipeId,
  collections,
  onShow,
}: CollectionRowsProps) {
  const recipes = useAppSelector(selectRecipes);
  const othersByCollection = useMemo(
    () =>
      recipes.reduce(
        (acc, entry) =>
          entry.id === recipeId
            ? acc
            : (entry.collectionIds ?? []).reduce(
                (inner, id) =>
                  inner.set(id, [...(inner.get(id) ?? []), entry.title]),
                acc,
              ),
        new Map<string, string[]>(),
      ),
    [recipes, recipeId],
  );
  const getLine = (collectionId: string) => {
    const others = othersByCollection.get(collectionId) ?? [];
    return others.length === 0
      ? 'Only this recipe'
      : `With ${joinSourceNames(others, COLLECTION_NAMES_SHOWN)}`;
  };

  return (
    <ActionGroup isRoomy>
      {collections.map((collection) => (
        <GroupRow
          key={collection.id}
          isRoomy
          icon='🗂️'
          ariaLabel={`In ${collection.label}: show its recipes`}
          onClick={
            onShow && othersByCollection.has(collection.id)
              ? () => onShow(collection.id)
              : undefined
          }
        >
          <span className='block font-medium wrap-break-word'>
            {collection.label}
          </span>
          <span className='text-muted-foreground line-clamp-2 text-sm font-normal'>
            {getLine(collection.id)}
          </span>
        </GroupRow>
      ))}
    </ActionGroup>
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
  /** Closes the drawer and shows the Recipes list narrowed to this source; a drawer opened from somewhere with no recipe list leaves it out, and the source is then only a label. */
  onShowSource?: (sourceId: string) => void;
  /** Closes the drawer and shows the Recipes list narrowed to this collection; a drawer opened from somewhere with no recipe list leaves it out, and the collection is then only a label. */
  onShowCollection?: (collectionId: string) => void;
  onOpenHistory: (id: string) => void;
  onOpenStock: (id: string, place: ContainerPlace) => void;
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
  onShowSource,
  onShowCollection,
  onOpenHistory,
  onOpenStock,
  onPutAway,
  onOpenNote,
}: RecipeDrawerProps) {
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const collections = useAppSelector(selectCollections);
  const cookSummary = useAppSelector(selectCookSummaries).get(recipeId);
  const { openSubview } = usePinchOverlay();
  const toggleFavorite = useRecipeFavorite(uid);
  const { isLoaded, loadError, markRecipeCooked } = useCookActions(uid);
  const isStockReady = useAppSelector(selectIsContainersReady);
  const stockError = useAppSelector(selectContainersLoadError);
  const hasStock = useAppSelector((state) =>
    selectStockByRecipe(state).has(recipeId),
  );
  const [markError, setMarkError] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [view, setView] = useState<DrawerView>('recipe');
  const [shareFooter, setShareFooter] = useState<HTMLElement | null>(null);
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
  const backToMore = () => setView('more');

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
  const recipeCollections = getRecipeCollections(recipe, collections);
  const collectionsPill = getCollectionsPill(
    recipeCollections.map((collection) => collection.label),
  );
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

  const getCookedText = () => {
    if (!cookSummary) return null;
    const day = formatDateShort(cookSummary.lastCookedAt);
    return cookSummary.count === 1
      ? { lead: 'Cooked once,', when: `on ${day}` }
      : { lead: `Cooked ${cookSummary.count} times,`, when: `last ${day}` };
  };
  const cookedText = getCookedText();
  const getViewBody = () => {
    if (view === 'photo') {
      return (
        <div className='space-y-3'>
          <BackLink onBack={backToRecipe} />
          <CoverImage
            coverPath={recipe.coverPath}
            coverUrl={recipe.coverUrl ?? null}
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
    if (view === 'collections') {
      return (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <BackLink onBack={backToRecipe} />
            <p className='font-medium'>{collectionsPill.label}</p>
          </div>
          <CollectionRows
            recipeId={recipe.id}
            collections={recipeCollections}
            onShow={onShowCollection}
          />
        </div>
      );
    }
    if (view === 'share') {
      return (
        <div className='space-y-4'>
          <div className='space-y-1'>
            <BackLink onBack={backToMore} />
            <p className='font-medium [@media(max-height:599px)]:hidden'>
              Share this recipe
            </p>
          </div>
          <ShareView
            kind='RECIPE'
            sourceId={recipe.id}
            footerNode={shareFooter}
            onClose={onClose}
          />
        </div>
      );
    }
    if (view === 'more') {
      return (
        <div className='space-y-5'>
          <BackLink onBack={backToRecipe} />
          <div className='space-y-2'>
            <ActionGroup isRoomy caption='What would you like to do?'>
              {cookPlan === null && recipe.steps.length > 0 && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<CookingPot />}
                  label='Start cooking'
                  subtitle='Steps one at a time, with a timer'
                  onClick={startCooking}
                />
              )}
              {cookPlan !== null && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<CalendarPlus />}
                  label='Plan it'
                  subtitle='On another day'
                  onClick={() => onPlan(recipe.id)}
                />
              )}
              {loadError === null && (
                <ActionRow
                  isGrouped
                  isRoomy
                  icon={<CircleCheck />}
                  label='Mark as cooked'
                  subtitle='Keeps a record you can change later'
                  isDisabled={!isLoaded || isHistoryFull || isMarking}
                  onClick={() => void handleMarkCooked()}
                />
              )}
              <AddToShoppingRow
                isGrouped
                isRoomy
                subtitle='Choose what you need for this recipe'
                onClick={() =>
                  onAddToShopping({ kind: 'recipe', recipeId: recipe.id })
                }
              />
              {canPutAway && (
                <ActionRow
                  isGrouped
                  isRoomy
                  hasChevron
                  icon={<PackagePlus />}
                  label='Put some away'
                  subtitle={
                    'In the fridge or freezer, with an eat\u2011by date'
                  }
                  isDisabled={!isStockReady}
                  onClick={() => onPutAway(recipe.id)}
                />
              )}
              <ShareDoorRow
                kind='RECIPE'
                sourceId={recipe.id}
                onClick={() => setView('share')}
              />
            </ActionGroup>
            {reasons.map((reason) => (
              <p key={reason} className='text-muted-foreground text-sm'>
                {reason}
              </p>
            ))}
            {markError && (
              <p className='text-destructive text-sm' role='alert'>
                {markError}
              </p>
            )}
          </div>
          <StockRows
            target={{ kind: 'recipe', id: recipe.id }}
            onOpenStock={(place) => onOpenStock(recipe.id, place)}
          />
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
        <>
          <StarButton
            isOn={isStarred(recipe)}
            label={`Favorite ${recipe.title}`}
            onClassName='text-[var(--pinch-drizzle)]'
            onClick={() => toggleFavorite(recipe)}
          />
          <DoorButton
            label='Notes and history'
            icon={<History className='h-5 w-5' aria-hidden='true' />}
            isOpen={shownView === 'history'}
            onClick={(opener) => openView('history', opener)}
          />
        </>
      }
      footer={
        shownView === 'share' ? (
          <div ref={setShareFooter} className='px-4 pb-4 empty:hidden' />
        ) : (
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
        )
      }
    >
      {viewBody}
      <div className={join(viewBody !== null && 'hidden')}>
        <RecipeFront
          uid={uid}
          recipe={recipe}
          onShowPhoto={(opener) => openView('photo', opener)}
          onShowCollections={(opener) => openView('collections', opener)}
          onShowSource={onShowSource}
          onShowCollection={onShowCollection}
          onFillIn={onFillIn}
        />
      </div>
    </DetailSheet>
  );
}

export default RecipeDrawer;
