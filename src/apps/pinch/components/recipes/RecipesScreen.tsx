import { memo, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { BookOpen, Plus } from 'lucide-react';

import FilterBar, { FilterSection } from '@/components/FilterBar';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import LazyMount from '@/components/LazyMount';
import SectionHeader from '@/components/SectionHeader';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import IdeasView from '@apps/pinch/components/ideas/IdeasView';
import AddToShoppingSheet from '@apps/pinch/components/shared/AddToShoppingSheet';
import EntryRow from '@apps/pinch/components/shared/EntryRow';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import CookingHistorySheet from '@apps/pinch/components/recipes/CookingHistorySheet';
import NoteSheet from '@apps/pinch/components/notes/NoteSheet';
import MealDrawer from '@apps/pinch/components/recipes/MealDrawer';
import MealRow from '@apps/pinch/components/recipes/MealRow';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import RecipeRow from '@apps/pinch/components/recipes/RecipeRow';
import {
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
  selectCostContext,
  selectIdeasLoadError,
  selectMeals,
  selectRecipeCosts,
  selectRecipes,
  selectShowNutrition,
  selectSourceCounts,
  selectSources,
  selectSourcesById,
} from '@apps/pinch/store/selectors';
import type { Gap, RecipesView, ShoppingRequest } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { getMealCost } from '@apps/pinch/utils/mealMath';
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
/** A row is its title and detail, plus a price line and a macro line when those are shown, and never shorter than its cover. */
const getRecipeRowHeight = (showPrices: boolean, showMacros: boolean) =>
  Math.max(COVER_SIZE, 40 + (showPrices ? 16 : 0) + (showMacros ? 22 : 0)) +
  ROW_PADDING_AND_RULE;

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
  const costContext = useAppSelector(selectCostContext);
  const sources = useAppSelector(selectSources);
  const sourcesById = useAppSelector(selectSourcesById);
  const sourceCounts = useAppSelector(selectSourceCounts);
  const ideaCount = useAppSelector((state) => state.pinch.ideas.items.length);
  const ideasLoadError = useAppSelector(selectIdeasLoadError);
  const isIdeasLoaded = useAppSelector((state) => state.pinch.ideas.isLoaded);
  const [view, setView] = useState<RecipesView>('recipes');
  const [query, setQuery] = useState('');
  const [pickedSource, setPickedSource] = useState(SOURCE_FILTER_ANY);
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
  const hasFilterBar = view === 'recipes' && sourceCounts.bySource.size > 0;
  const hasSearch = hasFilterBar || total >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';

  const getSourceFilter = () => {
    if (!hasFilterBar) return SOURCE_FILTER_ANY;
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
    return searchByName(
      inSource.map((recipe) => ({ name: recipe.title, recipe })),
      trimmed,
    ).map(({ recipe }) => recipe);
  }, [recipes, sourcesById, sourceFilter, trimmed]);

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
  const activeFilters =
    sourceFilter === SOURCE_FILTER_ANY
      ? []
      : [
          {
            key: 'source',
            label:
              sourceFilter === SOURCE_FILTER_NONE
                ? sourceLabel
                : `From ${sourceLabel}`,
          },
        ];
  const clearSourceFilter = () => setPickedSource(SOURCE_FILTER_ANY);

  const shownMeals = useMemo(
    () =>
      searchByName(
        meals.map((meal) => ({ name: meal.name, meal })),
        trimmed,
      ).map(({ meal }) => meal),
    [meals, trimmed],
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
                cost={getMealCost(meal.items, costContext)}
                showPrices={viewOptions.options.showPrices}
                showMacros={viewOptions.options.showMacros}
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
          Add the recipes you cook, from a photo, a link, a chat or by hand, and
          they'll be here, ready to plan.
        </p>
      );
    }
    if (shown.length === 0 && sourceFilter !== SOURCE_FILTER_ANY) {
      const scope =
        sourceFilter === SOURCE_FILTER_NONE
          ? 'without a source'
          : `from ${sourceLabel}`;
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm wrap-break-word'>
            {trimmed !== ''
              ? `Nothing ${scope} matches “${trimmed}” yet.`
              : sourceFilter === SOURCE_FILTER_NONE
                ? 'Every recipe has a source.'
                : `No recipes ${scope} yet.`}
          </p>
          <Button
            type='button'
            variant='secondary'
            className='h-10'
            onClick={clearSourceFilter}
          >
            Clear filter
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
            const estimatedHeight =
              rows.length *
              getRecipeRowHeight(
                viewOptions.options.showPrices,
                viewOptions.options.showMacros && isAnyMetricOn,
              );
            return (
              <div
                key={`${sourceFilter}-${trimmed}-${chunk}`}
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
        title={isIdeas ? 'Ideas' : 'Recipes'}
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
            className='h-10 w-10'
          />
        )}
      </div>
      {view === 'recipes' && sources.length > 0 && (
        <div className='grid grid-cols-2 gap-2'>
          <EntryRow
            icon={<BookOpen className='h-4 w-4' />}
            label='Sources'
            count={sources.length}
            onClick={() => openSubview({ kind: 'sources' })}
          />
        </div>
      )}
      {hasFilterBar ? (
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder={isPhone ? 'Search' : 'Search recipes'}
          filterLabel='Filter recipes'
          activeFilters={activeFilters}
          onRemoveFilter={clearSourceFilter}
          onClearFilters={clearSourceFilter}
          doneLabel={`Show ${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`}
          compactDoneLabel={`Show ${shown.length}`}
          trailing={
            <ListViewControls
              options={viewOptions.options}
              customizedCount={viewOptions.customizedCount}
              onChange={viewOptions.update}
              onReset={viewOptions.reset}
            />
          }
        >
          <FilterSection title='Source'>
            <PillGroup
              label='Sources'
              options={sourceOptions}
              value={sourceFilter}
              onChange={setPickedSource}
            />
          </FilterSection>
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
