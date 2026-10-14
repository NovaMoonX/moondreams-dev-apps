import { memo, useMemo, useState, type CSSProperties } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import LazyMount from '@/components/LazyMount';
import SectionHeader from '@/components/SectionHeader';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import FillInSheet from '@apps/pinch/components/shared/FillInSheet';
import ListViewControls from '@apps/pinch/components/shared/ListViewControls';
import MealDrawer from '@apps/pinch/components/recipes/MealDrawer';
import MealRow from '@apps/pinch/components/recipes/MealRow';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import RecipeRow from '@apps/pinch/components/recipes/RecipeRow';
import {
  LIST_SEARCH_THRESHOLD,
  RECIPES_VIEW_LABELS,
  RECIPES_VIEWS,
} from '@apps/pinch/constants';
import { useListViewOptions } from '@apps/pinch/hooks/useListViewOptions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectCostContext,
  selectMeals,
  selectRecipeCosts,
  selectRecipes,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap, RecipesView } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { getMealCost } from '@apps/pinch/utils/mealMath';
import { hasAnyMetricOn } from '@apps/pinch/utils/nutritionMath';

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
  const [view, setView] = useState<RecipesView>('recipes');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [fillIn, setFillIn] = useState<Gap[] | null>(null);

  const total = view === 'meals' ? meals.length : recipes.length;
  const hasSearch = total >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';
  const shown = useMemo(
    () =>
      searchByName(
        recipes.map((recipe) => ({ name: recipe.title, recipe })),
        trimmed,
      ).map(({ recipe }) => recipe),
    [recipes, trimmed],
  );

  const shownMeals = useMemo(
    () =>
      searchByName(
        meals.map((meal) => ({ name: meal.name, meal })),
        trimmed,
      ).map(({ meal }) => meal),
    [meals, trimmed],
  );

  const getBody = () => {
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
                key={`${trimmed}-${chunk}`}
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
        title='Recipes'
        action={
          <Button
            type='button'
            size='sm'
            rounded='full'
            className='gap-1'
            onClick={handleNew}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            New
          </Button>
        }
      />
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <PillGroup
            label='Recipes or meals'
            options={VIEW_OPTIONS}
            value={view}
            onChange={(next) => {
              setQuery('');
              setView(next);
            }}
            isThin
          />
        </div>
        {total > 0 && (
          <ListViewControls
            options={viewOptions.options}
            customizedCount={viewOptions.customizedCount}
            onChange={viewOptions.update}
            onReset={viewOptions.reset}
            className='h-10 w-10'
          />
        )}
      </div>
      {hasSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={view === 'meals' ? 'Search meals' : 'Search recipes'}
        />
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
        />
      )}
      {fillIn && (
        <FillInSheet uid={uid} gaps={fillIn} onClose={() => setFillIn(null)} />
      )}
    </div>
  );
}

export default memo(RecipesScreen);
