import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { saveIngredient } from '@apps/pinch/store/actions/ingredientActions';
import StockLine from '@apps/pinch/components/containers/StockLine';
import {
  selectIngredients,
  selectMeals,
  selectRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import {
  searchByName,
  searchIngredients,
} from '@apps/pinch/utils/catalogSearch';

const MAX_RESULTS = 8;
const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

interface ItemSearchProps {
  uid: string;
  /** Called with the picked ingredient's id, including one just made from the typed name. */
  onPick: (ingredientId: string) => void;
  /** When given, the person's recipes are searched too and picking one calls this instead. */
  onPickRecipe?: (recipeId: string) => void;
  /** When given, the person's saved meals are searched too and picking one calls this instead. */
  onPickMeal?: (mealId: string) => void;
  /** Called only when the field goes from empty to typed or back, so a caller that hides something while typing doesn't render on every keystroke. */
  onTypingChange?: (isTyping: boolean) => void;
  /** Ingredients already chosen, so they aren't offered twice. */
  excludeIds?: readonly string[];
  autoFocus?: boolean;
  resultsClassName?: string;
  /** The field still takes typing, but no result can be picked. */
  isDisabled?: boolean;
}

/** One search over the catalog and the person's own ingredients, capped at a few rows, that ends with "add this as a new ingredient" when nothing has exactly the typed name. */
function ItemSearch({
  uid,
  onPick,
  onPickRecipe,
  onPickMeal,
  onTypingChange,
  excludeIds = [],
  autoFocus = false,
  resultsClassName,
  isDisabled = false,
}: ItemSearchProps) {
  const dispatch = useAppDispatch();
  const ingredients = useAppSelector(selectIngredients);
  const recipes = useAppSelector(selectRecipes);
  const meals = useAppSelector(selectMeals);
  const isPhone = useMediaQuery().isBelow('sm');
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const [query, setTypedQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // A drawer or overlay takes focus itself while it opens, so the field is focused once that settles.
  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const timer = window.setTimeout(
      () => fieldRef.current?.querySelector('input')?.focus(),
      isPhone ? PHONE_FOCUS_DELAY_MS : DESKTOP_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [autoFocus, isPhone]);

  const trimmed = query.trim();
  const setQuery = (next: string) => {
    setTypedQuery(next);
    if ((next.trim() !== '') !== (trimmed !== '')) {
      onTypingChange?.(next.trim() !== '');
    }
  };
  const matches = useMemo(
    () =>
      searchIngredients(ingredients, trimmed)
        .filter((ingredient) => !excludeIds.includes(ingredient.id))
        .slice(0, MAX_RESULTS),
    [ingredients, trimmed, excludeIds],
  );
  const recipeMatches = useMemo(
    () =>
      onPickRecipe && trimmed !== ''
        ? searchByName(
            recipes.map((recipe) => ({ name: recipe.title, recipe })),
            trimmed,
          )
            .map(({ recipe }) => recipe)
            .filter((recipe) => !excludeIds.includes(recipe.id))
            .slice(0, MAX_RESULTS)
        : [],
    [onPickRecipe, recipes, trimmed, excludeIds],
  );
  const mealMatches = useMemo(
    () =>
      onPickMeal && trimmed !== ''
        ? searchByName(meals, trimmed).slice(0, MAX_RESULTS)
        : [],
    [onPickMeal, meals, trimmed],
  );
  const hasExactName = ingredients.some(
    (ingredient) =>
      ingredient.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  const canCreate = !hasExactName && trimmed.length <= MAX_NAME_LENGTH;
  const hasResults =
    mealMatches.length + recipeMatches.length + matches.length > 0;
  const getNoMatchLine = () => {
    if (hasResults) return null;
    if (canCreate) {
      return `Nothing called “${trimmed}” yet. You can add it as a new ingredient.`;
    }
    return hasExactName
      ? `“${trimmed}” is already added.`
      : `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`;
  };
  const noMatchLine = getNoMatchLine();

  const createFromName = async () => {
    setError(null);
    setIsCreating(true);
    try {
      const id = await dispatch(
        saveIngredient({
          uid,
          draft: {
            id: null,
            catalogId: null,
            name: trimmed,
            familyId: null,
            newFamilyName: null,
            nutrition: null,
            servingAmount: null,
            servingUnit: null,
          },
        }),
      ).unwrap();
      setQuery('');
      onPick(id);
    } catch (createError) {
      setError(getErrorMessage(createError, 'Unable to add this ingredient.'));
    } finally {
      setIsCreating(false);
    }
  };

  const getPlaceholder = () => {
    if (onPickMeal && meals.length > 0) {
      return isPhone
        ? 'Recipes, meals, ingredients'
        : 'Search recipes, saved meals, ingredients';
    }
    if (onPickRecipe) return 'Search recipes, ingredients';
    return 'Search ingredients';
  };

  return (
    <div
      className='space-y-2'
      onKeyDown={(event) =>
        event.key === 'Enter' &&
        event.target instanceof HTMLInputElement &&
        event.preventDefault()
      }
    >
      <div ref={fieldRef}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={getPlaceholder()}
        />
      </div>
      {trimmed !== '' && (
        <div className='border-border overflow-hidden rounded-2xl border'>
          {noMatchLine && (
            <p className='text-muted-foreground border-border border-b px-4 py-3 text-sm last:border-b-0'>
              {noMatchLine}
            </p>
          )}
          <ul className={join('divide-border divide-y', resultsClassName)}>
            {mealMatches.map((meal) => (
              <li key={meal.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isDisabled}
                  onClick={() => {
                    setQuery('');
                    onPickMeal?.(meal.id);
                  }}
                  className='h-auto min-h-12 w-full justify-start gap-3 px-3! py-1.5 text-left'
                >
                  <span
                    className='flex w-7 shrink-0 justify-center text-xl'
                    aria-hidden='true'
                  >
                    🍽️
                  </span>
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    {meal.name}
                  </span>
                  <span className='text-muted-foreground shrink-0 text-xs font-normal whitespace-nowrap'>
                    Saved meal
                  </span>
                </Button>
              </li>
            ))}
            {recipeMatches.map((recipe) => (
              <li key={recipe.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isDisabled}
                  onClick={() => {
                    setQuery('');
                    onPickRecipe?.(recipe.id);
                  }}
                  className='h-auto min-h-12 w-full justify-start gap-3 px-3! py-1.5 text-left'
                >
                  <span
                    className='flex w-7 shrink-0 justify-center text-xl'
                    aria-hidden='true'
                  >
                    🍲
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate font-medium'>
                      {recipe.title}
                    </span>
                    <StockLine summary={stockByRecipe.get(recipe.id)} />
                  </span>
                  <span className='text-muted-foreground text-xs font-normal'>
                    Recipe
                  </span>
                </Button>
              </li>
            ))}
            {matches.map((ingredient) => (
              <li key={ingredient.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isDisabled}
                  onClick={() => {
                    setQuery('');
                    onPick(ingredient.id);
                  }}
                  className='h-auto min-h-12 w-full justify-start gap-3 px-3! py-1.5 text-left'
                >
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    {ingredient.name}
                  </span>
                  {onPickRecipe && (
                    <span className='text-muted-foreground text-xs font-normal'>
                      Ingredient
                    </span>
                  )}
                </Button>
              </li>
            ))}
            {canCreate && (
              <li>
                <Button
                  type='button'
                  variant='tertiary'
                  disabled={isCreating || isDisabled}
                  onClick={() => void createFromName()}
                  className='h-auto min-h-12 w-full justify-start gap-3 px-3! py-1.5 text-left'
                >
                  <span className='bg-secondary text-secondary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full'>
                    <Plus className='h-4 w-4' aria-hidden='true' />
                  </span>
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    New ingredient “{trimmed}”
                  </span>
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}

export default ItemSearch;
