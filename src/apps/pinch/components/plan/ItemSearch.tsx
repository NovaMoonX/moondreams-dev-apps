import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { saveIngredient } from '@apps/pinch/store/actions/ingredientActions';
import { selectIngredients } from '@apps/pinch/store/selectors';
import { searchIngredients } from '@apps/pinch/utils/catalogSearch';

const MAX_RESULTS = 8;

interface ItemSearchProps {
  uid: string;
  /** Called with the picked ingredient's id, including one just made from the typed name. */
  onPick: (ingredientId: string) => void;
  /** Ingredients already chosen, so they aren't offered twice. */
  excludeIds?: readonly string[];
  autoFocus?: boolean;
}

/** One search over the catalog and the person's own ingredients, capped at a few rows, that ends with "add this as a new ingredient" when nothing has exactly the typed name. */
function ItemSearch({
  uid,
  onPick,
  excludeIds = [],
  autoFocus = false,
}: ItemSearchProps) {
  const dispatch = useAppDispatch();
  const ingredients = useAppSelector(selectIngredients);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const matches = useMemo(
    () =>
      searchIngredients(ingredients, trimmed)
        .filter((ingredient) => !excludeIds.includes(ingredient.id))
        .slice(0, MAX_RESULTS),
    [ingredients, trimmed, excludeIds],
  );
  const hasExactName = ingredients.some(
    (ingredient) =>
      ingredient.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

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
            iconKey: null,
            nutrition: null,
            servingAmount: null,
            servingUnit: null,
          },
        }),
      ).unwrap();
      onPick(id);
    } catch (createError) {
      setError(getErrorMessage(createError, 'Unable to add this ingredient.'));
    } finally {
      setIsCreating(false);
    }
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
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Search ingredients'
        autoFocus={autoFocus}
      />
      {trimmed === '' ? (
        <p className='text-muted-foreground px-1 text-sm'>
          Type a name to find it, or add one that isn't in the list.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {matches.map((ingredient) => (
            <li key={ingredient.id}>
              <Button
                type='button'
                variant='tertiary'
                onClick={() => onPick(ingredient.id)}
                className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-1.5 text-left'
              >
                <IngredientIcon iconKey={ingredient.iconKey} size={28} />
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {ingredient.name}
                </span>
              </Button>
            </li>
          ))}
          {!hasExactName && trimmed.length <= MAX_NAME_LENGTH && (
            <li>
              <Button
                type='button'
                variant='tertiary'
                disabled={isCreating}
                onClick={() => void createFromName()}
                className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-1.5 text-left'
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
      )}
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
}

export default ItemSearch;
