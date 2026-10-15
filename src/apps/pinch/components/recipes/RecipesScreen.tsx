import { memo, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

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
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';
import { getIdeaSearchText } from '@apps/pinch/utils/ideas';
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
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const stockByMeal = useAppSelector(selectStockByMealWithRecipes);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const ideas = useAppSelector(selectIdeas);
  const ideaCount = ideas.length;
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

  const visibleViews = RECIPES_VIEWS.filter(
    (candidate) =>
      candidate === 'recipes' ||
      (candidate === 'meals' && (meals.length > 0 || recipes.length >= 2)) ||
      (candidate === 'ideas' && (ideaCount > 0 || ideasLoadError !== null)),
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
  ).map((place) => ({
    value: place,
    label: `${CONTAINER_PLACE_LABELS[place]} · ${stockCounts[place]}`,
    emoji: CONTAINER_PLACE_EMOJIS[place],
  }));
  const hasStockFilter = !isIdeas && stockOptions.length > 0;
  const hasFilterBar = !isIdeas && (hasSourceSection || hasStockFilter);
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

  const isSearching = trimmed !== '';
  const searchIndex = useMemo(
    () =>
      isSearching
        ? buildRecipeSearchIndex(recipes, ingredientsById, sourcesById)
        : null,
    [isSearching, recipes, ingredientsById, sourcesById],
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
    const inStock =
      stockPlaces.length === 0
        ? inSource
        : inSource.filter((recipe) =>
            stockPlaces.some((place) =>
              hasStockIn(stockByRecipe.get(recipe.id), place),
            ),
          );
    return inStock;
  }, [searched, sourcesById, sourceFilter, stockPlaces, stockByRecipe]);

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
        const recipeMatches = searchRecipes(
          buildRecipeSearchIndex(recipes, ingredientsById, sourcesById),
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
              setStockPlaces([]);
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
      const outside = searched.length;
      const getText = () => {
        if (trimmed === '') {
          return sourceFilter === SOURCE_FILTER_NONE && stockPlaces.length === 0
            ? 'Every recipe has a source.'
            : `No recipes ${scope} yet.`;
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
                key={`${sourceFilter}-${stockPlaces.join(',')}-${chunk}`}
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

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={RECIPES_VIEW_LABELS[shownView]}
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
      {(visibleViews.length > 1 || (total > 0 && !hasFilterBar)) && (
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            {visibleViews.length > 1 && (
              <PillGroup
                label='Recipes, saved meals or ideas'
                options={VIEW_OPTIONS.filter((option) =>
                  visibleViews.includes(option.value),
                )}
                value={shownView}
                onChange={(next) => {
                  setQuery('');
                  setStockPlaces([]);
                  setView(next);
                }}
                isThin
              />
            )}
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
      )}
      {hasFilterBar ? (
        <FilterBar
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
            <ListViewControls
              options={viewOptions.options}
              customizedCount={viewOptions.customizedCount}
              onChange={viewOptions.update}
              onReset={viewOptions.reset}
              hasStockLines
            />
          }
        >
          {(close) => (
            <>
              {hasSourceSection && (
                <FilterSection
                  title='Source'
                  action={
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className="relative h-6! min-h-0! px-0! py-0! text-xs before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
                      onClick={() => {
                        close();
                        openSubview({ kind: 'sources' });
                      }}
                    >
                      Edit sources
                    </Button>
                  }
                >
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
        hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              shownView === 'meals'
                ? 'Search saved meals'
                : 'Search by name or ingredient'
            }
          />
        )
      )}
      {getBody()}
      {openId && (
        <RecipeDrawer
          key={openId}
          uid={uid}
          recipeId={openId}
          onClose={() => setOpenId(null)}
          onOpenSource={(sourceId) => {
            setOpenId(null);
            setView('recipes');
            setQuery('');
            setStockPlaces([]);
            setPickedSource(sourceId);
          }}
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
