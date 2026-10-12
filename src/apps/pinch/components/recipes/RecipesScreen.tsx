import { memo, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionHeader from '@/components/SectionHeader';
import { useAppSelector } from '@/store';
import RecipeDrawer from '@apps/pinch/components/recipes/RecipeDrawer';
import RecipeRow from '@apps/pinch/components/recipes/RecipeRow';
import {
  LIST_SEARCH_THRESHOLD,
  RECIPES_VIEW_LABELS,
  RECIPES_VIEWS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectRecipeCosts, selectRecipes } from '@apps/pinch/store/selectors';
import type { RecipesView } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

const VIEW_OPTIONS = RECIPES_VIEWS.map((value) => ({
  value,
  label: RECIPES_VIEW_LABELS[value],
}));

function RecipesScreen() {
  const { openSubview } = usePinchOverlay();
  const recipes = useAppSelector(selectRecipes);
  const costs = useAppSelector(selectRecipeCosts);
  const [view, setView] = useState<RecipesView>('recipes');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const trimmed = query.trim();
  const shown = useMemo(
    () =>
      searchByName(
        recipes.map((recipe) => ({ name: recipe.title, recipe })),
        trimmed,
      ).map(({ recipe }) => recipe),
    [recipes, trimmed],
  );

  const getBody = () => {
    if (view === 'meals') {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          No saved meals yet. They'll live here once you put a few together.
        </p>
      );
    }
    if (recipes.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Write down the recipes you cook and they'll be here, ready to plan.
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
      <ul className='divide-border divide-y'>
        {shown.map((recipe) => (
          <li key={recipe.id}>
            <RecipeRow
              recipe={recipe}
              cost={costs.get(recipe.id)}
              onOpen={setOpenId}
            />
          </li>
        ))}
      </ul>
    );
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
            onClick={() => openSubview({ kind: 'recipe', id: null })}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            New
          </Button>
        }
      />
      <PillGroup
        label='Recipes or meals'
        options={VIEW_OPTIONS}
        value={view}
        onChange={setView}
        isThin
      />
      {view === 'recipes' && recipes.length >= LIST_SEARCH_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder='Search recipes'
        />
      )}
      {getBody()}
      {openId && (
        <RecipeDrawer
          key={openId}
          recipeId={openId}
          onClose={() => setOpenId(null)}
          onModify={(id) => {
            setOpenId(null);
            openSubview({ kind: 'recipe', id });
          }}
        />
      )}
    </div>
  );
}

export default memo(RecipesScreen);
