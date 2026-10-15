import { memo, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { BookOpen, Plus } from 'lucide-react';

import EntryChip from '@/components/EntryChip';
import FilterBar, { FilterSection } from '@/components/FilterBar';
import { MultiPillGroup, PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import LazyMount from '@/components/LazyMount';
import SectionHeader from '@/components/SectionHeader';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import ContainerFormSheet, {
  type ContainerSubject,
} from '@apps/pinch/components/containers/ContainerFormSheet';
import IdeasView from '@apps/pinch/components/ideas/IdeasView';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import CookingHistorySheet from '@apps/pinch/components/recipes/CookingHistorySheet';
import NoteSheet from '@apps/pinch/components/notes/NoteSheet';
import MealDrawer from '@apps/pinch/components/recipes/MealDrawer';
import MealRow from '@apps/pinch/components/recipes/MealRow';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import RecipeRow from '@apps/pinch/components/recipes/RecipeRow';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  CONTAINER_PLACES,
  LIST_SEARCH_THRESHOLD,
  RECIPES_VIEW_LABELS,
  RECIPES_VIEWS,
  SOFT_MAX_IDEAS,
  SOURCE_FILTER_ANY,
  SOURCE_FILTER_NONE,
} from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIdeasLoadError,
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
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import {
  getStockParts,
  getStockPlaceCounts,
  hasStockIn,
  type StockSummary,
} from '@apps/pinch/utils/containers';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const VIEW_OPTIONS = RECIPES_VIEWS.map((value) => ({
  value,
  label: RECIPES_VIEW_LABELS[value],
}));

const RECIPE_CHUNK = 20;
const EAGER_RECIPE_CHUNKS = 1;
const COVER_SIZE = 56;
const ROW_PADDING_AND_RULE = 17;
/** A row is its title and detail, plus a price line, a macro line and a stock line when those show, and never shorter than its cover. */
const getRecipeRowHeight = (
  showPrices: boolean,
  showMacros: boolean,
  stockHeight: number,
) =>
  Math.max(
    COVER_SIZE,
    40 + (showPrices ? 16 : 0) + (showMacros ? 22 : 0) + stockHeight,
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
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const stockByMeal = useAppSelector(selectStockByMealWithRecipes);
  const ideaCount = useAppSelector((state) => state.pinch.ideas.items.length);
  const ideasLoadError = useAppSelector(selectIdeasLoadError);
  const isIdeasLoaded = useAppSelector((state) => state.pinch.ideas.isLoaded);
  const [view, setView] = useState<RecipesView>('recipes');
  const [query, setQuery] = useState('');
  const [pickedSource, setPickedSource] = useState(SOURCE_FILTER_ANY);
  const [stockPlaces, setStockPlaces] = useState<ContainerPlace[]>([]);
  const [putAway, setPutAway] = useState<ContainerSubject | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<{
    recipeId: string;
    noteId: string | null;
  } | null>(null);
  const [fillIn, setFillIn] = useState<Gap[] | null>(null);
  const [shopping, setShopping] = useState<ShoppingRequest | null>(null);
  const [isIdeaAddOpen, setIsIdeaAddOpen] = useState(false);

  const isIdeas = view === 'ideas';
  const canAddIdea = isIdeasLoaded && ideasLoadError === null;
  const total = isIdeas ? 0 : view === 'meals' ? meals.length : recipes.length;
  const hasSourceFilter = view === 'recipes' && sourceCounts.bySource.size > 0;
  const stockMap = view === 'meals' ? stockByMeal : stockByRecipe;
  const stockCounts = useMemo(
    () =>
      getStockPlaceCounts(
        view === 'meals'
          ? meals.map((meal) => meal.id)
          : recipes.map((recipe) => recipe.id),
        stockMap,
      ),
    [view, meals, recipes, stockMap],
  );
  const stockOptions = CONTAINER_PLACES.filter(
    (place) => stockCounts[place] > 0 || stockPlaces.includes(place),
  ).map((place) => ({
    value: place,
    label: `${CONTAINER_PLACE_LABELS[place]} · ${stockCounts[place]}`,
    emoji: CONTAINER_PLACE_EMOJIS[place],
  }));
  const hasStockFilter = !isIdeas && stockOptions.length > 0;
  const hasFilterBar = !isIdeas && (hasSourceFilter || hasStockFilter);
  const hasSearch = hasFilterBar || total >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';

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

  const shown = useMemo(() => {
    const inSource =
      sourceFilter === SOURCE_FILTER_ANY
        ? recipes
        : recipes.filter(
            (recipe) =>
              (getRecipeSource(recipe, sourcesById)?.id ??
                SOURCE_FILTER_NONE) === sourceFilter,
          );
    const inStock =
      stockPlaces.length === 0
        ? inSource
        : inSource.filter((recipe) =>
            stockPlaces.some((place) =>
              hasStockIn(stockByRecipe.get(recipe.id), place),
            ),
          );
    return searchByName(
      inStock.map((recipe) => ({ name: recipe.title, recipe })),
      trimmed,
    ).map(({ recipe }) => recipe);
  }, [recipes, sourcesById, sourceFilter, stockPlaces, stockByRecipe, trimmed]);

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
  const activeFilters = [
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
    ...stockPlaces.map((place) => ({
      key: `stock-${place}`,
      label: `In the ${CONTAINER_PLACE_LABELS[place].toLowerCase()}`,
    })),
  ];
  const clearSourceFilter = () => setPickedSource(SOURCE_FILTER_ANY);
  const clearFilters = () => {
    setPickedSource(SOURCE_FILTER_ANY);
    setStockPlaces([]);
  };
  const removeFilter = (key: string) =>
    key === 'source'
      ? clearSourceFilter()
      : setStockPlaces((current) =>
          current.filter((place) => `stock-${place}` !== key),
        );

  const shownMeals = useMemo(
    () =>
      searchByName(
        (stockPlaces.length === 0
          ? meals
          : meals.filter((meal) =>
              stockPlaces.some((place) =>
                hasStockIn(stockByMeal.get(meal.id), place),
              ),
            )
        ).map((meal) => ({ name: meal.name, meal })),
        trimmed,
      ).map(({ meal }) => meal),
    [meals, stockPlaces, stockByMeal, trimmed],
  );

  const getBody = () => {
    if (isIdeas) {
      return (
        <IdeasView
          uid={uid}
          isAddOpen={isIdeaAddOpen}
          onAddClose={() => setIsIdeaAddOpen(false)}
          onOpenRecipe={setOpenId}
        />
      );
    }
    if (view === 'meals') {
      if (meals.length === 0) {
        return (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            No saved meals yet. Put a few items together once and plan them
            again in a tap.
          </p>
        );
      }
      if (shownMeals.length === 0 && stockPlaces.length > 0) {
        return (
          <div className='space-y-3 py-6 text-center'>
            <p className='text-muted-foreground text-sm wrap-break-word'>
              {trimmed !== ''
                ? `No saved meals in stock match “${trimmed}”.`
                : 'No saved meals are in stock there.'}
            </p>
            <Button
              type='button'
              variant='secondary'
              className='h-10'
              onClick={clearFilters}
            >
              Clear filter
            </Button>
          </div>
        );
      }
      if (shownMeals.length === 0) {
        return (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{trimmed}” yet.
          </p>
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
              />
            </li>
          ))}
        </ul>
      );
    }
    if (recipes.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Add the recipes you cook, from text, a file, a link or by hand, and
          they'll be here, ready to plan.
        </p>
      );
    }
    if (shown.length === 0 && activeFilters.length > 0) {
      const scope = [
        sourceFilter === SOURCE_FILTER_NONE
          ? 'without a source'
          : sourceFilter !== SOURCE_FILTER_ANY
            ? `from ${sourceLabel}`
            : null,
        stockPlaces.length > 0
          ? `in the ${stockPlaces.map((place) => CONTAINER_PLACE_LABELS[place].toLowerCase()).join(' or ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {trimmed !== ''
              ? `Nothing ${scope} matches “${trimmed}” yet.`
              : sourceFilter === SOURCE_FILTER_NONE && stockPlaces.length === 0
                ? 'Every recipe has a source.'
                : `No recipes ${scope} yet.`}
          </p>
          <Button
            type='button'
            variant='secondary'
            className='h-10'
            onClick={clearFilters}
          >
            Clear {activeFilters.length === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      );
    }
    if (shown.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          Nothing matches “{trimmed}” yet.
        </p>
      );
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
                key={`${sourceFilter}-${stockPlaces.join(',')}-${trimmed}-${chunk}`}
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
                  eager={chunk < EAGER_RECIPE_CHUNKS}
                >
                  <ul className='divide-border divide-y lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0'>
                    {rows.map((recipe) => (
                      <li
                        key={recipe.id}
                        className='lg:border-border lg:border-b'
                      >
                        <RecipeRow
                          recipe={recipe}
                          cost={costs.get(recipe.id)}
                          showPrices={viewOptions.options.showPrices}
                          showMacros={viewOptions.options.showMacros}
                          showStock={viewOptions.options.showStock}
                          onOpen={setOpenId}
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
    if (view === 'meals') {
      openSubview({ kind: 'meal', id: null });
      return;
    }
    if (isPhone) {
      setIsStartOpen(true);
      return;
    }
    openSubview({ kind: 'recipe', id: null });
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={RECIPES_VIEW_LABELS[view]}
        action={
          (!isIdeas || ideaCount < SOFT_MAX_IDEAS) && (
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='gap-1'
              disabled={isIdeas && !canAddIdea}
              onClick={handleNew}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              {isIdeas ? 'New idea' : 'New'}
            </Button>
          )
        }
      />
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <PillGroup
            label='Recipes, meals or ideas'
            options={VIEW_OPTIONS}
            value={view}
            onChange={(next) => {
              setQuery('');
              setStockPlaces([]);
              setView(next);
            }}
            isThin
          />
        </div>
        {total > 0 && !hasFilterBar && (
          <ListViewControls
            options={viewOptions.options}
            customizedCount={viewOptions.customizedCount}
            onChange={viewOptions.update}
            onReset={viewOptions.reset}
            hasStockLines
            className='-my-3'
          />
        )}
      </div>
      {hasFilterBar ? (
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder={
            isPhone
              ? 'Search'
              : view === 'meals'
                ? 'Search meals'
                : 'Search recipes'
          }
          filterLabel={view === 'meals' ? 'Filter meals' : 'Filter recipes'}
          activeFilters={activeFilters}
          onRemoveFilter={removeFilter}
          onClearFilters={clearFilters}
          doneLabel={
            view === 'meals'
              ? `Show ${shownMeals.length} ${shownMeals.length === 1 ? 'meal' : 'meals'}`
              : `Show ${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`
          }
          compactDoneLabel={`Show ${view === 'meals' ? shownMeals.length : shown.length}`}
          trailing={
            <ListViewControls
              options={viewOptions.options}
              customizedCount={viewOptions.customizedCount}
              onChange={viewOptions.update}
              onReset={viewOptions.reset}
              hasStockLines
            />
          }
        >
          {hasSourceFilter && (
            <FilterSection title='Source'>
              <PillGroup
                label='Sources'
                options={sourceOptions}
                value={sourceFilter}
                onChange={setPickedSource}
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
        </FilterBar>
      ) : (
        hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={view === 'meals' ? 'Search meals' : 'Search recipes'}
          />
        )
      )}
      {view === 'recipes' && sources.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          <EntryChip
            icon={<BookOpen className='h-4 w-4' />}
            label='Sources'
            count={sources.length}
            onClick={() => openSubview({ kind: 'sources' })}
          />
        </div>
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
          onOpenHistory={(id) => {
            setOpenId(null);
            setHistoryId(id);
          }}
          onOpenStock={(id) => {
            setOpenId(null);
            openSubview({ kind: 'containers', recipeId: id });
          }}
          onPutAway={(id) => {
            setOpenId(null);
            setPutAway({ kind: 'recipe', id });
          }}
          onOpenNote={(recipeId, noteId) => {
            setOpenId(null);
            setNoteTarget({ recipeId, noteId });
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
          onClose={() =>
            setNoteTarget((current) =>
              current === noteTarget ? null : current,
            )
          }
          onUpdateRecipe={(noteId) => {
            const { recipeId } = noteTarget;
            setNoteTarget(null);
            openSubview({ kind: 'recipe', id: recipeId, fromNoteId: noteId });
          }}
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
          onFillIn={(gaps) => {
            setOpenMealId(null);
            setFillIn(gaps);
          }}
          onAddToShopping={(request) => {
            setOpenMealId(null);
            setShopping(request);
          }}
          onOpenStock={(id) => {
            setOpenMealId(null);
            openSubview({ kind: 'containers', mealId: id });
          }}
          onPutAway={(id) => {
            setOpenMealId(null);
            setPutAway({ kind: 'meal', id });
          }}
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
