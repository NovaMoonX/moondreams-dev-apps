import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { BookOpen, Check, ListChecks, Pencil, Plus, Star } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FilterBar, { FilterSection } from '@/components/FilterBar';
import HeaderIconButton from '@/components/HeaderIconButton';
import LazyMount from '@/components/LazyMount';
import Pill from '@/components/Pill';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import { useBackStep } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSelection } from '@/hooks/useSelection';
import { useAppSelector } from '@/store';
import ContainerFormSheet, {
  type ContainerSubject,
} from '@apps/pinch/components/containers/ContainerFormSheet';
import IdeasView from '@apps/pinch/components/ideas/IdeasView';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import ListSortControl from '@apps/pinch/components/shared/ListSortControl';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import AddToCollectionSheet from '@apps/pinch/components/recipes/AddToCollectionSheet';
import CollectionsSheet from '@apps/pinch/components/recipes/CollectionsSheet';
import CookingHistorySheet from '@apps/pinch/components/recipes/CookingHistorySheet';
import type { WrittenNoteKind } from '@apps/pinch/components/notes/NoteKindPills';
import NoteSheet from '@apps/pinch/components/notes/NoteSheet';
import MealDrawer from '@apps/pinch/components/recipes/MealDrawer';
import MealRow from '@apps/pinch/components/recipes/MealRow';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import RecipeRow from '@apps/pinch/components/recipes/RecipeRow';
import {
  CATEGORY_FILTER_ANY,
  CATEGORY_FILTER_NONE,
  CATEGORY_TITLE,
  COLLECTION_FILTER_ANY,
  COLLECTION_FILTER_NONE,
  COLLECTION_NOUN,
  COLLECTION_NOUN_PLURAL,
  COLLECTIONS_TITLE,
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_PLACES,
  DISH_CATEGORIES,
  LIST_SEARCH_THRESHOLD,
  RECIPES_VIEW_LABELS,
  RECIPES_VIEW_NEW_LABELS,
  RECIPES_VIEWS,
  SOFT_MAX_IDEAS,
  SOURCE_FILTER_ANY,
  SOURCE_FILTER_NONE,
} from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { useMealFavorite } from '@apps/pinch/hooks/useMealFavorite';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { useOnRecipeAdded } from '@apps/pinch/hooks/useRecipeAdded';
import { useRecipeFavorite } from '@apps/pinch/hooks/useRecipeFavorite';
import { usePinchSessionState } from '@apps/pinch/hooks/usePinchSession';
import { useOnSourceShown } from '@apps/pinch/hooks/useSourceShown';
import {
  selectCollectionCounts,
  selectCollections,
  selectCollectionsById,
  selectIdeas,
  selectIdeasLoadError,
  selectIngredientsById,
  selectMeals,
  selectRecipeCosts,
  selectRecipes,
  selectShowNutrition,
  selectSourceCounts,
  selectSources,
  selectSourcesById,
  selectStockByMealWithRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type {
  ContainerPlace,
  Gap,
  RecipesView,
  ShoppingRequest,
} from '@apps/pinch/types';
import {
  buildRecipeSearchIndex,
  searchByName,
  searchRecipes,
} from '@apps/pinch/utils/catalogSearch';
import {
  getStockParts,
  getStockPlaceCounts,
  hasStockIn,
  type StockSummary,
} from '@apps/pinch/utils/containers';
import {
  filterByCategory,
  getCategoryCounts,
  getCategoryFilterOptions,
} from '@apps/pinch/utils/categories';
import {
  filterByCollection,
  getCollectionFilterOptions,
  getRecipeSelectionNote,
  getRecipeSelectionTitle,
} from '@apps/pinch/utils/collections';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { isStarred, sortFavoritesFirst } from '@apps/pinch/utils/favorites';
import {
  DEFAULT_LIST_SORT,
  sortList,
  type ListSort,
} from '@apps/pinch/utils/listSort';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';
import { getIdeaSearchText } from '@apps/pinch/utils/ideas';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const VIEW_OPTIONS = RECIPES_VIEWS.map((value) => ({
  value,
  label: RECIPES_VIEW_LABELS[value],
}));

const SHORT_WIDE_SHOWN =
  '[@media(max-height:500px)_and_(min-width:420px)]:inline-flex';
const SHORT_WIDE_HIDDEN =
  '[@media(max-height:500px)_and_(min-width:420px)]:hidden';
const RECIPE_CHUNK = 20;
const EAGER_RECIPE_CHUNKS = 1;
const COVER_SIZE = 56;
const ROW_PADDING_AND_RULE = 17;
const TITLE_LINE = 24;
const TITLE_CHARS_PER_LINE_PHONE = 26;
const TITLE_CHARS_PER_LINE_WIDE = 46;

/** A title runs to two lines at most; whether it needs both is judged from its length, so the estimate follows the row the browser will draw. */
const getTitleLines = (title: string, isPhone: boolean) =>
  Math.min(
    2,
    Math.max(
      1,
      Math.ceil(
        title.length /
          (isPhone ? TITLE_CHARS_PER_LINE_PHONE : TITLE_CHARS_PER_LINE_WIDE),
      ),
    ),
  );

/** A row is its title (one or two lines) and detail, plus a price line, a macro line and a stock line when those show, and never shorter than its cover. */
const getRecipeRowHeight = (
  titleLines: number,
  showPrices: boolean,
  showMacros: boolean,
  stockHeight: number,
) =>
  Math.max(
    COVER_SIZE,
    TITLE_LINE * titleLines +
      16 +
      (showPrices ? 16 : 0) +
      (showMacros ? 22 : 0) +
      stockHeight,
  ) + ROW_PADDING_AND_RULE;

const getStockHeight = (
  summary: StockSummary | undefined,
  isPhone: boolean,
) => {
  if (summary === undefined) return 0;

  const lines = getStockParts(summary).map((part) => (part.due ? 20 : 16));
  return isPhone
    ? lines.reduce((sum, line) => sum + line, 0) + 2 * (lines.length - 1)
    : Math.max(...lines);
};

// Closing a sheet steps its history entry back, and the browser then restores the scroll the page
// had when it opened, so a jump to the top has to come after that.
const scrollToTopAfterSheetCloses = () => {
  const toTop = () => {
    window.clearTimeout(giveUp);
    window.setTimeout(() => window.scrollTo({ top: 0 }), 0);
  };
  const giveUp = window.setTimeout(
    () => window.removeEventListener('popstate', toTop),
    1000,
  );
  window.addEventListener('popstate', toTop, { once: true });
};

interface NoMatchProps {
  text: string;
  actionLabel: string | null;
  onAction: () => void;
}

function NoMatch({ text, actionLabel, onAction }: NoMatchProps) {
  return (
    <div className='space-y-3 py-6 text-center'>
      <p className='text-muted-foreground text-sm wrap-break-word'>{text}</p>
      {actionLabel && (
        <Button
          type='button'
          variant='secondary'
          className='h-10'
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

interface RecipesScreenProps {
  uid: string;
}

function RecipesScreen({ uid }: RecipesScreenProps) {
  const { openSubview, setIsStartOpen } = usePinchOverlay();
  const isPhone = useMediaQuery().isBelow('sm');
  const viewOptions = useListViewOptions(uid, 'recipes');
  const isAnyMetricOn = hasAnyMetricOn(useAppSelector(selectShowNutrition));
  const recipes = useAppSelector(selectRecipes);
  const costs = useAppSelector(selectRecipeCosts);
  const meals = useAppSelector(selectMeals);
  const sources = useAppSelector(selectSources);
  const sourcesById = useAppSelector(selectSourcesById);
  const sourceCounts = useAppSelector(selectSourceCounts);
  const collections = useAppSelector(selectCollections);
  const collectionsById = useAppSelector(selectCollectionsById);
  const collectionCounts = useAppSelector(selectCollectionCounts);
  const toggleFavorite = useMealFavorite(uid);
  const toggleRecipeFavorite = useRecipeFavorite(uid);
  const selection = useSelection();
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const stockByMeal = useAppSelector(selectStockByMealWithRecipes);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const ideas = useAppSelector(selectIdeas);
  const ideaCount = ideas.length;
  const ideasLoadError = useAppSelector(selectIdeasLoadError);
  const isIdeasLoaded = useAppSelector((state) => state.pinch.ideas.isLoaded);
  const [view, setView] = usePinchSessionState<RecipesView>(
    'recipes:view',
    'recipes',
  );
  const [query, setQuery] = usePinchSessionState('recipes:query', '');
  const [pickedSource, setPickedSource] = usePinchSessionState(
    'recipes:source',
    SOURCE_FILTER_ANY,
  );
  const [pickedCollection, setPickedCollection] = usePinchSessionState(
    'recipes:collection',
    COLLECTION_FILTER_ANY,
  );
  const [pickedCategory, setPickedCategory] = usePinchSessionState(
    'recipes:category',
    CATEGORY_FILTER_ANY,
  );
  const [recipeSort, setRecipeSort] = usePinchSessionState<ListSort>(
    'recipes:sort:recipes',
    DEFAULT_LIST_SORT,
  );
  const [mealSort, setMealSort] = usePinchSessionState<ListSort>(
    'recipes:sort:meals',
    DEFAULT_LIST_SORT,
  );
  const [pickedFavorites, setPickedFavorites] = usePinchSessionState(
    'recipes:favorites',
    false,
  );
  const [stockPlaces, setStockPlaces] = usePinchSessionState<ContainerPlace[]>(
    'recipes:stock',
    [],
  );
  const [putAway, setPutAway] = useState<ContainerSubject | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<{
    recipeId: string;
    noteId: string | null;
    kind: WrittenNoteKind | null;
  } | null>(null);
  const [isCollectionsOpen, setIsCollectionsOpen] = useState(false);
  const [isPickingCollections, setIsPickingCollections] = useState(false);
  const [fillIn, setFillIn] = useState<Gap[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingRequest | null>(null);
  const [isIdeaAddOpen, setIsIdeaAddOpen] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);

  useOnRecipeAdded((recipeId) => {
    setView('recipes');
    setQuery('');
    setPickedSource(SOURCE_FILTER_ANY);
    setPickedCollection(COLLECTION_FILTER_ANY);
    setPickedCategory(CATEGORY_FILTER_ANY);
    setStockPlaces([]);
    setRevealId(recipeId);
  });

  const showSource = (sourceId: string) => {
    setView('recipes');
    setQuery('');
    setStockPlaces([]);
    setPickedCollection(COLLECTION_FILTER_ANY);
    setPickedCategory(CATEGORY_FILTER_ANY);
    setPickedSource(sourceId);
  };

  const showCollection = (collectionId: string) => {
    setView('recipes');
    setQuery('');
    setStockPlaces([]);
    setPickedSource(SOURCE_FILTER_ANY);
    setPickedCategory(CATEGORY_FILTER_ANY);
    setPickedCollection(collectionId);
  };

  useOnSourceShown(showSource);

  useEffect(() => {
    if (revealId === null) {
      return;
    }
    document
      .querySelector(`[data-recipe-id="${CSS.escape(revealId)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [revealId]);

  const visibleViews = RECIPES_VIEWS.filter(
    (candidate) =>
      candidate === 'recipes' ||
      (candidate === 'meals' && (meals.length > 0 || recipes.length >= 1)) ||
      (candidate === 'ideas' &&
        (ideaCount > 0 || ideasLoadError !== null || recipes.length >= 1)),
  );
  const shownView = visibleViews.includes(view) ? view : 'recipes';
  const isIdeas = shownView === 'ideas';
  const canAddIdea = isIdeasLoaded && ideasLoadError === null;
  const total = isIdeas
    ? 0
    : shownView === 'meals'
      ? meals.length
      : recipes.length;
  const hasSourceFilter =
    shownView === 'recipes' && sourceCounts.bySource.size > 0;
  const hasSourceSection = shownView === 'recipes' && sources.length > 0;
  const hasCollectionSection =
    shownView === 'recipes' && collections.length > 0;
  const hasCollectionFilter =
    hasCollectionSection && collectionCounts.byCollection.size > 0;
  const categorySource = shownView === 'meals' ? meals : recipes;
  const categoryCounts = useMemo(
    () => getCategoryCounts(categorySource),
    [categorySource],
  );
  const hasCategoryFilter = !isIdeas && categoryCounts.byCategory.size > 0;
  const favoriteSource = shownView === 'meals' ? meals : recipes;
  const favoriteCount = favoriteSource.filter(isStarred).length;
  const hasFavoritesFilter =
    (shownView === 'meals' || shownView === 'recipes') &&
    favoriteCount > 0 &&
    favoriteSource.length >= LIST_SEARCH_THRESHOLD;
  const isFavoritesOn = hasFavoritesFilter && pickedFavorites;
  const stockMap = shownView === 'meals' ? stockByMeal : stockByRecipe;
  const stockCounts = useMemo(
    () =>
      getStockPlaceCounts(
        shownView === 'meals'
          ? meals.map((meal) => meal.id)
          : recipes.map((recipe) => recipe.id),
        stockMap,
      ),
    [shownView, meals, recipes, stockMap],
  );
  const stockOptions = CONTAINER_PLACES.filter(
    (place) => stockCounts[place] > 0 || stockPlaces.includes(place),
  ).map((place) => {
    const count = stockCounts[place];
    const noun =
      shownView === 'meals'
        ? count === 1
          ? 'saved meal'
          : 'saved meals'
        : count === 1
          ? 'recipe'
          : 'recipes';
    return {
      value: place,
      label: `${CONTAINER_PLACE_LABELS[place]} · ${count} ${noun}`,
      emoji: CONTAINER_PLACE_EMOJIS[place],
    };
  });
  const hasStockFilter =
    !isIdeas &&
    stockOptions.length > 0 &&
    (shownView === 'recipes' || meals.length >= LIST_SEARCH_THRESHOLD);
  const hasFilterBar =
    !isIdeas &&
    (hasCategoryFilter ||
      hasSourceSection ||
      hasCollectionSection ||
      hasFavoritesFilter ||
      hasStockFilter);
  const hasPillRow = visibleViews.length > 1;
  const hasViewOptions = total > 0 && !hasFilterBar;
  const hasSearch = hasFilterBar || total >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';
  const hasSort = !isIdeas && total >= 2;
  const activeRecipeSort = hasSort ? recipeSort : DEFAULT_LIST_SORT;
  const activeMealSort = hasSort ? mealSort : DEFAULT_LIST_SORT;

  const getCategoryFilter = () => {
    if (pickedCategory === CATEGORY_FILTER_NONE) {
      return hasCategoryFilter && categoryCounts.withoutCategory > 0
        ? pickedCategory
        : CATEGORY_FILTER_ANY;
    }
    const isPresent = DISH_CATEGORIES.some(
      (category) =>
        category.value === pickedCategory &&
        categoryCounts.byCategory.has(category.value),
    );
    return hasCategoryFilter && isPresent
      ? pickedCategory
      : CATEGORY_FILTER_ANY;
  };
  const categoryFilter = getCategoryFilter();
  const categoryLabel =
    DISH_CATEGORIES.find((category) => category.value === categoryFilter)
      ?.label ?? '';

  const getSourceFilter = () => {
    if (!hasSourceFilter) return SOURCE_FILTER_ANY;
    if (pickedSource === SOURCE_FILTER_NONE || sourcesById.has(pickedSource)) {
      return pickedSource;
    }
    return SOURCE_FILTER_ANY;
  };
  const sourceFilter = getSourceFilter();
  const sourceLabel =
    sourceFilter === SOURCE_FILTER_NONE
      ? 'No source'
      : (sourcesById.get(sourceFilter)?.label ?? '');

  const getCollectionFilter = () => {
    if (!hasCollectionFilter) return COLLECTION_FILTER_ANY;
    if (
      pickedCollection === COLLECTION_FILTER_NONE ||
      collectionsById.has(pickedCollection)
    ) {
      return pickedCollection;
    }
    return COLLECTION_FILTER_ANY;
  };
  const collectionFilter = getCollectionFilter();
  const collectionLabel =
    collectionFilter === COLLECTION_FILTER_NONE
      ? `No ${COLLECTION_NOUN}`
      : (collectionsById.get(collectionFilter)?.label ?? '');

  const isSearching = trimmed !== '';
  const searchIndex = useMemo(
    () =>
      isSearching
        ? buildRecipeSearchIndex(
            recipes,
            ingredientsById,
            sourcesById,
            collectionsById,
          )
        : null,
    [isSearching, recipes, ingredientsById, sourcesById, collectionsById],
  );
  const searched = useMemo(
    () => (searchIndex ? searchRecipes(searchIndex, trimmed) : recipes),
    [searchIndex, trimmed, recipes],
  );
  const shown = useMemo(() => {
    const inSource =
      sourceFilter === SOURCE_FILTER_ANY
        ? searched
        : searched.filter(
            (recipe) =>
              (getRecipeSource(recipe, sourcesById)?.id ??
                SOURCE_FILTER_NONE) === sourceFilter,
          );
    const inCollection = filterByCollection(
      inSource,
      collectionFilter,
      collections,
    );
    const inCategory = filterByCategory(inCollection, categoryFilter);
    const inStock =
      stockPlaces.length === 0
        ? inCategory
        : inCategory.filter((recipe) =>
            stockPlaces.some((place) =>
              hasStockIn(stockByRecipe.get(recipe.id), place),
            ),
          );
    const starred = isFavoritesOn ? inStock.filter(isStarred) : inStock;
    return activeRecipeSort.key === 'default'
      ? sortFavoritesFirst(starred)
      : sortList(starred, activeRecipeSort, (recipe) => recipe.title);
  }, [
    searched,
    sourcesById,
    sourceFilter,
    collectionFilter,
    categoryFilter,
    activeRecipeSort,
    collections,
    stockPlaces,
    stockByRecipe,
    isFavoritesOn,
  ]);

  const sourceOptions = useMemo(
    () => [
      { value: SOURCE_FILTER_ANY, label: 'Any' },
      ...sources
        .filter(
          (source) =>
            sourceCounts.bySource.has(source.id) || source.id === sourceFilter,
        )
        .map((source) => ({
          value: source.id,
          label: `${source.label} · ${sourceCounts.bySource.get(source.id) ?? 0}`,
        })),
      ...(sourceCounts.withoutSource > 0 || sourceFilter === SOURCE_FILTER_NONE
        ? [
            {
              value: SOURCE_FILTER_NONE,
              label: `No source · ${sourceCounts.withoutSource}`,
            },
          ]
        : []),
    ],
    [sources, sourceCounts, sourceFilter],
  );
  const categoryOptions = useMemo(
    () => getCategoryFilterOptions(categoryCounts),
    [categoryCounts],
  );
  const collectionOptions = useMemo(
    () =>
      getCollectionFilterOptions(
        collections,
        collectionCounts,
        collectionFilter,
      ),
    [collections, collectionCounts, collectionFilter],
  );
  const activeFilters = [
    ...(categoryFilter === CATEGORY_FILTER_ANY
      ? []
      : [
          {
            key: 'category',
            label:
              categoryFilter === CATEGORY_FILTER_NONE
                ? 'No category'
                : categoryLabel,
          },
        ]),
    ...(sourceFilter === SOURCE_FILTER_ANY
      ? []
      : [
          {
            key: 'source',
            label:
              sourceFilter === SOURCE_FILTER_NONE
                ? sourceLabel
                : `From ${sourceLabel}`,
          },
        ]),
    ...(collectionFilter === COLLECTION_FILTER_ANY
      ? []
      : [
          {
            key: 'collection',
            label:
              collectionFilter === COLLECTION_FILTER_NONE
                ? `In no ${COLLECTION_NOUN}`
                : `In ${collectionLabel}`,
          },
        ]),
    ...(isFavoritesOn ? [{ key: 'favorites', label: 'Favorites' }] : []),
    ...stockPlaces.map((place) => ({
      key: `stock-${place}`,
      label: `In the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`,
    })),
  ];
  const clearFilters = () => {
    setPickedCategory(CATEGORY_FILTER_ANY);
    setPickedSource(SOURCE_FILTER_ANY);
    setPickedCollection(COLLECTION_FILTER_ANY);
    setPickedFavorites(false);
    setStockPlaces([]);
  };
  const removeFilter = (key: string) => {
    if (key === 'category') return setPickedCategory(CATEGORY_FILTER_ANY);
    if (key === 'source') return setPickedSource(SOURCE_FILTER_ANY);
    if (key === 'collection') return setPickedCollection(COLLECTION_FILTER_ANY);
    if (key === 'favorites') return setPickedFavorites(false);
    return setStockPlaces((current) =>
      current.filter((place) => `stock-${place}` !== key),
    );
  };

  const shownMeals = useMemo(() => {
    const matching = searchByName(
      (stockPlaces.length === 0
        ? filterByCategory(meals, categoryFilter)
        : filterByCategory(meals, categoryFilter).filter((meal) =>
            stockPlaces.some((place) =>
              hasStockIn(stockByMeal.get(meal.id), place),
            ),
          )
      )
        .filter((meal) => !isFavoritesOn || isStarred(meal))
        .map((meal) => ({ name: meal.name, meal })),
      trimmed,
    ).map(({ meal }) => meal);

    return sortList(matching, activeMealSort, (meal) => meal.name);
  }, [
    meals,
    categoryFilter,
    stockPlaces,
    stockByMeal,
    trimmed,
    isFavoritesOn,
    activeMealSort,
  ]);

  const isSelecting = selection.isActive && shownView === 'recipes';
  const canSelect = shownView === 'recipes' && shown.length >= 2;
  const selectedRecipes = shown.filter((recipe) =>
    selection.ids.has(recipe.id),
  );
  const isEveryShownTicked =
    shown.length > 0 && selectedRecipes.length === shown.length;
  const toggleSelection = selection.toggle;
  const toggleOne = useCallback(
    (id: string) => toggleSelection([id]),
    [toggleSelection],
  );
  useBackStep(isSelecting, selection.exit);

  const getBody = () => {
    if (isIdeas) {
      return (
        <IdeasView
          uid={uid}
          initialQuery={query}
          isAddOpen={isIdeaAddOpen}
          onAddClose={() => setIsIdeaAddOpen(false)}
          onOpenRecipe={setOpenId}
        />
      );
    }
    if (shownView === 'meals') {
      if (meals.length === 0) {
        return (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            No saved meals yet. Put a few items together once and plan them
            again in a tap.
          </p>
        );
      }
      if (shownMeals.length === 0 && activeFilters.length > 0) {
        const scope = [
          isFavoritesOn ? 'that you starred' : null,
          categoryFilter === CATEGORY_FILTER_NONE
            ? 'in no category'
            : categoryFilter !== CATEGORY_FILTER_ANY
              ? `in the ${categoryLabel} category`
              : null,
          stockPlaces.length > 0 ? 'in stock' : null,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div className='space-y-3 py-6 text-center'>
            <p className='text-muted-foreground text-sm wrap-break-word'>
              {trimmed !== ''
                ? `No saved meals ${scope} match “${trimmed}”.`
                : `No saved meals ${scope} yet.`}
            </p>
            <Button
              type='button'
              variant='secondary'
              className='h-10'
              onClick={clearFilters}
            >
              {`Clear ${activeFilters.length === 1 ? 'filter' : 'filters'}`}
            </Button>
          </div>
        );
      }
      if (shownMeals.length === 0) {
        const recipeMatches = searchRecipes(
          buildRecipeSearchIndex(
            recipes,
            ingredientsById,
            sourcesById,
            collectionsById,
          ),
          trimmed,
        ).length;
        return (
          <NoMatch
            text={
              recipeMatches === 0
                ? `Nothing matches “${trimmed}” yet.`
                : `No saved meal matches “${trimmed}”, but ${recipeMatches === 1 ? '1 recipe does' : `${recipeMatches} recipes do`}.`
            }
            actionLabel={recipeMatches > 0 ? 'Show recipes' : null}
            onAction={() => {
              clearFilters();
              setView('recipes');
            }}
          />
        );
      }
      return (
        <ul className='divide-border divide-y'>
          {shownMeals.map((meal) => (
            <li key={meal.id}>
              <MealRow
                meal={meal}
                showPrices={viewOptions.options.showPrices}
                showMacros={viewOptions.options.showMacros}
                showStock={viewOptions.options.showStock}
                onOpen={setOpenMealId}
                onToggleFavorite={toggleFavorite}
              />
            </li>
          ))}
        </ul>
      );
    }
    if (recipes.length === 0) {
      return (
        <EmptyCard icon='🍳'>
          Add the recipes you cook, from text, a file, a link or by hand, and
          they'll be here, ready to plan.
        </EmptyCard>
      );
    }
    if (shown.length === 0 && activeFilters.length > 0) {
      const scope = [
        isFavoritesOn ? 'that you starred' : null,
        categoryFilter === CATEGORY_FILTER_NONE
          ? 'in no category'
          : categoryFilter !== CATEGORY_FILTER_ANY
            ? `in the ${categoryLabel} category`
            : null,
        sourceFilter === SOURCE_FILTER_NONE
          ? 'without a source'
          : sourceFilter !== SOURCE_FILTER_ANY
            ? `from ${sourceLabel}`
            : null,
        collectionFilter === COLLECTION_FILTER_NONE
          ? `in no ${COLLECTION_NOUN}`
          : collectionFilter !== COLLECTION_FILTER_ANY
            ? `in the ${collectionLabel} ${COLLECTION_NOUN}`
            : null,
        stockPlaces.length > 0
          ? `in the ${stockPlaces.map((place) => CONTAINER_PLACE_LABELS[place].toLowerCase()).join(' or ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' ');
      const outside = searched.length;
      const getText = () => {
        if (trimmed === '') {
          if (activeFilters.length === 1) {
            if (sourceFilter === SOURCE_FILTER_NONE) {
              return 'Every recipe has a source.';
            }
            if (categoryFilter === CATEGORY_FILTER_NONE) {
              return 'Every recipe has a category.';
            }
            if (collectionFilter === COLLECTION_FILTER_NONE) {
              return `Every recipe is in a ${COLLECTION_NOUN}.`;
            }
          }
          return `No recipes ${scope} yet.`;
        }
        if (outside === 0) return `Nothing matches “${trimmed}” yet.`;
        return `Nothing ${scope} matches “${trimmed}”, but ${outside === 1 ? '1 other recipe does' : `${outside} other recipes do`}.`;
      };
      return (
        <NoMatch
          text={getText()}
          actionLabel={`Clear ${activeFilters.length === 1 ? 'filter' : 'filters'}`}
          onAction={clearFilters}
        />
      );
    }
    if (shown.length === 0) {
      const ideaMatches = searchByName(
        ideas.map((idea) => ({ name: getIdeaSearchText(idea) })),
        trimmed,
      ).length;
      const mealMatches = searchByName(meals, trimmed).length;
      const getWider = () => {
        if (mealMatches > 0) {
          return {
            text: `No recipe matches “${trimmed}”, but ${mealMatches === 1 ? '1 saved meal does' : `${mealMatches} saved meals do`}.`,
            actionLabel: 'Show saved meals',
            onAction: () => setView('meals'),
          };
        }
        if (ideaMatches > 0) {
          return {
            text: `No recipe matches “${trimmed}”, but ${ideaMatches === 1 ? '1 idea does' : `${ideaMatches} ideas do`}.`,
            actionLabel: 'Show ideas',
            onAction: () => setView('ideas'),
          };
        }
        return {
          text: `Nothing matches “${trimmed}” yet.`,
          actionLabel: null,
          onAction: () => undefined,
        };
      };
      return <NoMatch {...getWider()} />;
    }
    return (
      <div>
        {Array.from(
          { length: Math.ceil(shown.length / RECIPE_CHUNK) },
          (_, chunk) => {
            const rows = shown.slice(
              chunk * RECIPE_CHUNK,
              (chunk + 1) * RECIPE_CHUNK,
            );
            const estimatedHeight = rows.reduce(
              (sum, recipe) =>
                sum +
                getRecipeRowHeight(
                  getTitleLines(recipe.title, isPhone),
                  viewOptions.options.showPrices,
                  viewOptions.options.showMacros && isAnyMetricOn,
                  viewOptions.options.showStock
                    ? getStockHeight(stockByRecipe.get(recipe.id), isPhone)
                    : 0,
                ),
              0,
            );
            return (
              <div
                key={`${sourceFilter}-${collectionFilter}-${categoryFilter}-${activeRecipeSort.key}-${activeRecipeSort.order}-${stockPlaces.join(',')}-${chunk}`}
                className={join(
                  'defer-offscreen',
                  chunk > 0 && 'border-border border-t',
                )}
                style={
                  { '--defer-size': `${estimatedHeight}px` } as CSSProperties
                }
              >
                <LazyMount
                  estimatedHeight={estimatedHeight}
                  eager={
                    chunk < EAGER_RECIPE_CHUNKS ||
                    rows.some((recipe) => recipe.id === revealId)
                  }
                >
                  <ul className='divide-border divide-y lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0'>
                    {rows.map((recipe) => (
                      <li
                        key={recipe.id}
                        data-recipe-id={recipe.id}
                        className='lg:border-border lg:border-b'
                      >
                        <RecipeRow
                          recipe={recipe}
                          cost={costs.get(recipe.id)}
                          showPrices={viewOptions.options.showPrices}
                          showMacros={viewOptions.options.showMacros}
                          showStock={viewOptions.options.showStock}
                          onOpen={setOpenId}
                          onToggleFavorite={toggleRecipeFavorite}
                          isSelecting={isSelecting}
                          isSelected={selection.ids.has(recipe.id)}
                          onToggle={toggleOne}
                        />
                      </li>
                    ))}
                  </ul>
                </LazyMount>
              </div>
            );
          },
        )}
      </div>
    );
  };

  const handleNew = () => {
    if (isIdeas) {
      if (canAddIdea) setIsIdeaAddOpen(true);
      return;
    }
    if (shownView === 'meals') {
      openSubview({ kind: 'meal', id: null });
      return;
    }
    if (isPhone) {
      setIsStartOpen(true);
      return;
    }
    openSubview({ kind: 'recipe', id: null });
  };

  const allShownPill = (
    <Pill
      isThin
      isSelected={isEveryShownTicked}
      icon={
        isEveryShownTicked ? (
          <Check className='h-3 w-3' aria-hidden='true' />
        ) : undefined
      }
      onClick={() => selection.toggle(shown.map((recipe) => recipe.id))}
    >
      {isPhone ? 'All shown' : 'Select all shown'}
    </Pill>
  );
  const sortControl = hasSort && (
    <ListSortControl
      label={shownView === 'meals' ? 'Sort saved meals' : 'Sort recipes'}
      sort={shownView === 'meals' ? mealSort : recipeSort}
      onChange={shownView === 'meals' ? setMealSort : setRecipeSort}
    />
  );
  const searchClassName = join(
    isSelecting &&
      trimmed === '' &&
      activeFilters.length === 0 &&
      '[@media(max-height:500px)]:hidden',
  );

  const getHeaderAction = () => {
    if (isSelecting) {
      return (
        <div className='flex items-center gap-3'>
          {/* The header's own hit-area rule would leave a thin pill 36px tall. */}
          <span
            className={join(
              'hidden [&_button]:before:-inset-y-2!',
              SHORT_WIDE_SHOWN,
            )}
          >
            {allShownPill}
          </span>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className="relative h-7 px-3 after:absolute after:-inset-1.5 after:content-['']"
            onClick={selection.exit}
          >
            Cancel
          </Button>
        </div>
      );
    }
    if (isIdeas && ideaCount >= SOFT_MAX_IDEAS) return undefined;

    return (
      <div className='flex items-center gap-3'>
        {hasSourceSection && (
          <HeaderIconButton
            icon={<BookOpen className='h-4 w-4' aria-hidden='true' />}
            label='Sources'
            onClick={() => openSubview({ kind: 'sources' })}
          />
        )}
        {canSelect && (
          <HeaderIconButton
            icon={<ListChecks className='h-4 w-4' aria-hidden='true' />}
            label='Select recipes'
            onClick={selection.start}
          />
        )}
        {hasViewOptions && (
          <ListViewControls
            isQuiet
            options={viewOptions.options}
            customizedCount={viewOptions.customizedCount}
            onChange={viewOptions.update}
            onReset={viewOptions.reset}
            hasStockLines
          />
        )}
        <Button
          type='button'
          size='sm'
          rounded='full'
          className="relative gap-1 whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] max-[359px]:size-7 max-[359px]:gap-0 max-[359px]:p-0 max-[359px]:after:-inset-x-1.5"
          disabled={isIdeas && !canAddIdea}
          onClick={handleNew}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          <span className='max-[359px]:sr-only'>
            {RECIPES_VIEW_NEW_LABELS[shownView]}
          </span>
        </Button>
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={
          isSelecting
            ? getRecipeSelectionTitle(selectedRecipes.length)
            : 'Recipes'
        }
        action={getHeaderAction()}
      />
      {isSelecting && (
        <div
          role='group'
          aria-label='Select several at once'
          className={join(
            'flex flex-wrap items-center gap-x-2 gap-y-2',
            SHORT_WIDE_HIDDEN,
          )}
        >
          {allShownPill}
        </div>
      )}
      {!isSelecting && hasPillRow && (
        <PillGroup
          label='Recipes, saved meals or ideas'
          options={VIEW_OPTIONS.filter((option) =>
            visibleViews.includes(option.value),
          )}
          value={shownView}
          onChange={(next) => {
            setQuery('');
            setStockPlaces([]);
            setPickedCategory(CATEGORY_FILTER_ANY);
            setView(next);
          }}
          isThin
        />
      )}
      {hasFilterBar ? (
        <FilterBar
          className={searchClassName}
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder={
            isPhone
              ? 'Search'
              : shownView === 'meals'
                ? 'Search saved meals'
                : 'Search by name or ingredient'
          }
          filterLabel={
            shownView === 'meals' ? 'Filter saved meals' : 'Filter recipes'
          }
          activeFilters={activeFilters}
          onRemoveFilter={removeFilter}
          onClearFilters={clearFilters}
          doneLabel={
            shownView === 'meals'
              ? `Show ${shownMeals.length} ${shownMeals.length === 1 ? 'saved meal' : 'saved meals'}`
              : `Show ${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`
          }
          compactDoneLabel={`Show ${shownView === 'meals' ? shownMeals.length : shown.length}`}
          trailing={
            <>
              {sortControl}
              <ListViewControls
                options={viewOptions.options}
                customizedCount={viewOptions.customizedCount}
                onChange={viewOptions.update}
                onReset={viewOptions.reset}
                hasStockLines
              />
            </>
          }
        >
          {(closeFilters) => (
            <>
              {hasCategoryFilter && (
                <FilterSection title={CATEGORY_TITLE}>
                  <PillGroup
                    label='Categories'
                    options={categoryOptions}
                    value={categoryFilter}
                    onChange={setPickedCategory}
                  />
                </FilterSection>
              )}
              {hasSourceSection && (
                <FilterSection title='Source'>
                  {hasSourceFilter ? (
                    <PillGroup
                      label='Sources'
                      options={sourceOptions}
                      value={sourceFilter}
                      onChange={setPickedSource}
                    />
                  ) : (
                    <p className='text-muted-foreground text-sm'>
                      None of your recipes has a source right now.
                    </p>
                  )}
                </FilterSection>
              )}
              {hasCollectionSection && (
                <FilterSection
                  title={COLLECTIONS_TITLE}
                  action={
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      rounded='full'
                      aria-label={`Edit ${COLLECTION_NOUN_PLURAL}`}
                      title={`Edit ${COLLECTION_NOUN_PLURAL}`}
                      className='-my-2 size-10 shrink-0 p-0'
                      onClick={() => {
                        closeFilters();
                        setIsCollectionsOpen(true);
                      }}
                    >
                      <Pencil className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  }
                >
                  {hasCollectionFilter ? (
                    <PillGroup
                      label={COLLECTIONS_TITLE}
                      options={collectionOptions}
                      value={collectionFilter}
                      onChange={setPickedCollection}
                    />
                  ) : (
                    <p className='text-muted-foreground text-sm'>
                      {`None of your recipes is in a ${COLLECTION_NOUN} right now.`}
                    </p>
                  )}
                </FilterSection>
              )}
              {hasFavoritesFilter && (
                <FilterSection title='Favorites'>
                  <MultiPillGroup
                    label='Favorites'
                    options={[
                      {
                        value: 'favorites',
                        label: `Favorites · ${favoriteCount}`,
                        icon: (
                          <Star
                            className='h-4 w-4 fill-current text-[var(--pinch-drizzle)]'
                            aria-hidden='true'
                          />
                        ),
                      },
                    ]}
                    values={isFavoritesOn ? ['favorites'] : []}
                    onChange={(values) => setPickedFavorites(values.length > 0)}
                  />
                </FilterSection>
              )}
              {hasStockFilter && (
                <FilterSection title='In stock'>
                  <MultiPillGroup
                    label='In stock'
                    options={stockOptions}
                    values={stockPlaces}
                    onChange={setStockPlaces}
                  />
                </FilterSection>
              )}
            </>
          )}
        </FilterBar>
      ) : (
        (hasSearch || hasSort) && (
          <div
            className={join(
              'flex items-center gap-2',
              !hasSearch && 'justify-end',
              searchClassName,
            )}
          >
            {hasSearch && (
              <SearchInput
                className='min-w-0 flex-1'
                value={query}
                onChange={setQuery}
                placeholder={
                  shownView === 'meals'
                    ? 'Search saved meals'
                    : 'Search by name or ingredient'
                }
              />
            )}
            {sortControl}
          </div>
        )
      )}
      {getBody()}
      {openId && (
        <RecipeDrawer
          key={openId}
          uid={uid}
          recipeId={openId}
          onClose={() => setOpenId(null)}
          onPlan={(id) => {
            setOpenId(null);
            openSubview({
              kind: 'plan',
              dayKey: getCellDayKey(new Date()),
              mealType: null,
              plannedMealId: null,
              fromMealId: null,
              fromRecipeId: id,
            });
          }}
          onModify={(id) => {
            setOpenId(null);
            openSubview({ kind: 'recipe', id });
          }}
          onFillIn={(gaps) => {
            setOpenId(null);
            setFillIn(gaps);
          }}
          onAddToShopping={(request) => {
            setOpenId(null);
            setShopping(request);
          }}
          onShowSource={(sourceId) => {
            setOpenId(null);
            showSource(sourceId);
            scrollToTopAfterSheetCloses();
          }}
          onShowCollection={(collectionId) => {
            setOpenId(null);
            showCollection(collectionId);
            scrollToTopAfterSheetCloses();
          }}
          onOpenHistory={(id) => {
            setOpenId(null);
            setHistoryId(id);
          }}
          onOpenStock={(id, place) => {
            setOpenId(null);
            openSubview({ kind: 'containers', recipeId: id, place });
          }}
          onPutAway={(id) => {
            setOpenId(null);
            setPutAway({ kind: 'recipe', id });
          }}
          onOpenNote={(recipeId, noteId, kind = null) => {
            setOpenId(null);
            setNoteTarget({ recipeId, noteId, kind });
          }}
        />
      )}
      {noteTarget && (
        <NoteSheet
          key={`${noteTarget.recipeId}-${noteTarget.noteId ?? 'new'}`}
          uid={uid}
          recipeId={noteTarget.recipeId}
          noteId={noteTarget.noteId}
          initialCookId={null}
          initialKind={noteTarget.kind}
          onClose={() =>
            setNoteTarget((current) =>
              current === noteTarget ? null : current,
            )
          }
        />
      )}
      {historyId && (
        <CookingHistorySheet
          key={historyId}
          uid={uid}
          recipeId={historyId}
          onClose={() => setHistoryId(null)}
        />
      )}
      {openMealId && (
        <MealDrawer
          key={openMealId}
          uid={uid}
          mealId={openMealId}
          onClose={() => setOpenMealId(null)}
          onPlan={(id) => {
            setOpenMealId(null);
            openSubview({
              kind: 'plan',
              dayKey: getCellDayKey(new Date()),
              mealType: null,
              plannedMealId: null,
              fromMealId: id,
              fromRecipeId: null,
            });
          }}
          onModify={(id) => {
            setOpenMealId(null);
            openSubview({ kind: 'meal', id });
          }}
          onAddToShopping={(request) => {
            setOpenMealId(null);
            setShopping(request);
          }}
          onOpenStock={(id, place) => {
            setOpenMealId(null);
            openSubview({ kind: 'containers', mealId: id, place });
          }}
          onPutAway={(id) => {
            setOpenMealId(null);
            setPutAway({ kind: 'meal', id });
          }}
          onToggleFavorite={toggleFavorite}
        />
      )}
      {isSelecting && (
        <SelectionBar
          note={getRecipeSelectionNote(selectedRecipes.length)}
          actions={[]}
          primary={{
            key: 'add-to-collection',
            label: `Add to a ${COLLECTION_NOUN}`,
            shortLabel: `Add to a ${COLLECTION_NOUN}`,
            isDisabled: selectedRecipes.length === 0,
            onClick: () => setIsPickingCollections(true),
          }}
        />
      )}
      {isPickingCollections && (
        <AddToCollectionSheet
          uid={uid}
          recipeIds={selectedRecipes.map((recipe) => recipe.id)}
          onClose={() => setIsPickingCollections(false)}
          onDone={() => {
            setIsPickingCollections(false);
            selection.exit();
          }}
        />
      )}
      {isCollectionsOpen && (
        <CollectionsSheet
          uid={uid}
          onClose={() => setIsCollectionsOpen(false)}
        />
      )}
      {putAway && (
        <ContainerFormSheet
          key={`${putAway.kind}-${putAway.kind === 'typed' ? putAway.name : putAway.id}`}
          uid={uid}
          initial={putAway}
          onClose={() =>
            setPutAway((current) => (current === putAway ? null : current))
          }
        />
      )}
      {fillIn && (
        <FillInSheet uid={uid} gaps={fillIn} onClose={() => setFillIn(null)} />
      )}
      {shopping && (
        <AddToShoppingSheet
          uid={uid}
          request={shopping}
          onClose={() => setShopping(null)}
        />
      )}
    </div>
  );
}

export default memo(RecipesScreen);
