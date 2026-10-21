import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import SearchInput from '@/components/SearchInput';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { saveIngredient } from '@apps/pinch/store/actions/ingredientActions';
import StockLine from '@apps/pinch/components/containers/StockLine';
import {
  selectIngredientFamiliesById,
  selectIngredients,
  selectIngredientsById,
  selectMeals,
  selectRecipes,
  selectStockByRecipe,
} from '@apps/pinch/store/selectors';
import type { ResolvedIngredient } from '@apps/pinch/types';
import {
  searchByName,
  searchIngredients,
} from '@apps/pinch/utils/catalogSearch';
import { getStockParts } from '@apps/pinch/utils/containers';
import { toTypedIngredientName } from '@apps/pinch/utils/ingredientNames';
import { MAX_PICK_SUGGESTIONS } from '@apps/pinch/utils/pickerSuggestions';

const MAX_RESULTS = 8;
const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

const LANDSCAPE_MAX_HEIGHT = 499;

// A landscape phone shows two shorter rows, and the last one left drops its bottom border because the frame draws one.
const getSuggestionRowClass = (index: number) =>
  join(
    index === 1 && '[@media(max-height:499px)]:border-b-0',
    index === 2 && '[@media(max-height:499px)]:hidden',
  );

export interface ItemSuggestions {
  /** What the rows are, in a few words. */
  caption: string;
  /** Ingredient ids to offer while the field is empty, already ordered and capped by the caller. */
  ids: readonly string[];
}

interface PickRowShellProps {
  trailing?: ReactNode;
  isCompact?: boolean;
  isDisabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

function PickRowShell({
  trailing,
  isCompact = false,
  isDisabled,
  onClick,
  children,
}: PickRowShellProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      disabled={isDisabled}
      onClick={onClick}
      className={join(
        'h-auto w-full justify-start gap-3 px-3! text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
        isCompact ? 'min-h-10 items-center py-0!' : 'items-start py-1.5!',
      )}
    >
      <span
        className={join(
          'flex min-w-0 flex-1 flex-col justify-center',
          isCompact ? 'min-h-8' : 'min-h-10',
        )}
      >
        {children}
      </span>
      {trailing && (
        <span className='flex h-10 shrink-0 items-center'>{trailing}</span>
      )}
    </Button>
  );
}

interface IngredientPickRowProps {
  name: string;
  detail: string | null;
  trailing?: ReactNode;
  isCompact?: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function IngredientPickRow({
  name,
  detail,
  trailing,
  isCompact = false,
  isDisabled,
  onClick,
}: IngredientPickRowProps) {
  return (
    <PickRowShell
      trailing={trailing}
      isCompact={isCompact}
      isDisabled={isDisabled}
      onClick={onClick}
    >
      <span className='truncate font-medium'>{name}</span>
      {!isCompact && detail && (
        <span className='text-muted-foreground truncate text-xs font-normal'>
          {detail}
        </span>
      )}
    </PickRowShell>
  );
}

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
  /** Rows of the person's own ingredients drawn under the field while it is empty; nothing is drawn when there are none. */
  suggestions?: ItemSuggestions;
  autoFocus?: boolean;
  /** Typed results scroll inside the room a sheet leaves under the field, so the field and the footer stay on screen. */
  isCapped?: boolean;
  /** The field still takes typing, but no result can be picked. */
  isDisabled?: boolean;
  /** When given, "New ingredient" hands the typed name over instead of writing it: a picker never writes. */
  onStageNew?: (name: string) => void;
}

/** One search over the catalog and the person's own ingredients, capped at a few rows, that ends with "add this as a new ingredient" when nothing has exactly the typed name. */
function ItemSearch({
  uid,
  onPick,
  onPickRecipe,
  onPickMeal,
  onTypingChange,
  excludeIds = [],
  suggestions,
  autoFocus = false,
  isCapped = false,
  isDisabled = false,
  onStageNew,
}: ItemSearchProps) {
  const dispatch = useAppDispatch();
  const ingredients = useAppSelector(selectIngredients);
  const recipes = useAppSelector(selectRecipes);
  const meals = useAppSelector(selectMeals);
  const isPhone = useMediaQuery().isBelow('sm');
  const stockByRecipe = useAppSelector(selectStockByRecipe);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const familiesById = useAppSelector(selectIngredientFamiliesById);
  const isLandscape = useIsShortScreen(LANDSCAPE_MAX_HEIGHT);
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
  const suggested = (suggestions?.ids ?? [])
    .flatMap((id) => {
      const ingredient = ingredientsById.get(id);
      return ingredient && !ingredient.isArchived && !excludeIds.includes(id)
        ? [ingredient]
        : [];
    })
    .slice(0, MAX_PICK_SUGGESTIONS);
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
  const getRowLook = (ingredient: ResolvedIngredient) => ({
    detail: familiesById.get(ingredient.familyId ?? '')?.name ?? null,
  });

  const createFromName = async () => {
    if (onStageNew) {
      onStageNew(toTypedIngredientName(trimmed));
      setQuery('');
      return;
    }
    setError(null);
    setIsCreating(true);
    try {
      const id = await dispatch(
        saveIngredient({
          uid,
          draft: {
            id: null,
            catalogId: null,
            name: toTypedIngredientName(trimmed),
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
      {trimmed === '' && suggestions && suggested.length > 0 && (
        <div className='pt-1'>
          <ActionGroup isRoomy caption={suggestions.caption}>
            {suggested.map((ingredient, index) => (
              <div key={ingredient.id} className={getSuggestionRowClass(index)}>
                <IngredientPickRow
                  name={ingredient.name}
                  {...getRowLook(ingredient)}
                  isCompact={isLandscape}
                  isDisabled={isDisabled}
                  onClick={() => onPick(ingredient.id)}
                />
              </div>
            ))}
          </ActionGroup>
        </div>
      )}
      {trimmed !== '' && (
        <div className='border-border overflow-hidden rounded-2xl border'>
          {noMatchLine && (
            <p className='text-muted-foreground border-border border-b px-4 py-3 text-sm last:border-b-0'>
              {noMatchLine}
            </p>
          )}
          <ul
            className={join(
              'divide-border divide-y',
              isCapped &&
                'max-h-[max(12rem,calc(92dvh-22rem))] overflow-y-auto [@media(max-height:499px)]:max-h-32',
            )}
          >
            {mealMatches.map((meal) => (
              <li key={meal.id}>
                <PickRowShell
                  trailing={
                    <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
                      Saved meal
                    </span>
                  }
                  isCompact={isLandscape}
                  isDisabled={isDisabled}
                  onClick={() => {
                    setQuery('');
                    onPickMeal?.(meal.id);
                  }}
                >
                  <span className='truncate font-medium'>{meal.name}</span>
                </PickRowShell>
              </li>
            ))}
            {recipeMatches.map((recipe) => {
              const stock = stockByRecipe.get(recipe.id);
              const isCompactRow =
                isLandscape && (!stock || getStockParts(stock).length === 0);
              return (
                <li key={recipe.id}>
                  <PickRowShell
                    trailing={
                      <span className='text-muted-foreground text-xs font-normal'>
                        Recipe
                      </span>
                    }
                    isCompact={isCompactRow}
                    isDisabled={isDisabled}
                    onClick={() => {
                      setQuery('');
                      onPickRecipe?.(recipe.id);
                    }}
                  >
                    <span className='truncate font-medium'>{recipe.title}</span>
                    <StockLine summary={stock} />
                  </PickRowShell>
                </li>
              );
            })}
            {matches.map((ingredient) => (
              <li key={ingredient.id}>
                <IngredientPickRow
                  name={ingredient.name}
                  {...getRowLook(ingredient)}
                  isCompact={isLandscape}
                  isDisabled={isDisabled}
                  onClick={() => {
                    setQuery('');
                    onPick(ingredient.id);
                  }}
                  trailing={
                    onPickRecipe && (
                      <span className='text-muted-foreground text-xs font-normal'>
                        Ingredient
                      </span>
                    )
                  }
                />
              </li>
            ))}
            {canCreate && (
              <li>
                <PickRowShell
                  isCompact={isLandscape}
                  isDisabled={isCreating || isDisabled}
                  onClick={() => void createFromName()}
                >
                  <span className='flex min-w-0 items-center gap-2 font-medium'>
                    <Plus className='size-4 shrink-0' aria-hidden='true' />
                    <span className='truncate'>
                      New ingredient “{trimmed}”
                    </span>
                  </span>
                </PickRowShell>
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
