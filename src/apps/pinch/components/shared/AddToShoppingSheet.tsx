import { useMemo, useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  MAX_SHOPPING_LINES_PER_ADD,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectRecipesById,
  selectShoppingById,
  selectShoppingItems,
  selectShoppingLoadError,
} from '@apps/pinch/store/selectors';
import type { ShoppingRequest } from '@apps/pinch/types';
import { formatSize } from '@apps/pinch/utils/productFormat';
import {
  getItemsLines,
  getRecipeLines,
  getShoppingItemId,
} from '@apps/pinch/utils/shopping';

interface AddToShoppingSheetProps {
  uid: string;
  request: ShoppingRequest;
  onClose: () => void;
}

/** What is already on the list starts unticked, since ticking it adds more. */
function AddToShoppingSheet({
  uid,
  request,
  onClose,
}: AddToShoppingSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { showShoppingTab } = usePinchOverlay();
  const recipesById = useAppSelector(selectRecipesById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const onList = useAppSelector(selectShoppingById);
  const listCount = useAppSelector(selectShoppingItems).length;
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const recipe =
    request.kind === 'recipe'
      ? (recipesById.get(request.recipeId) ?? null)
      : null;
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const lines =
      request.kind === 'recipe'
        ? recipe
          ? getRecipeLines(recipe, ingredientsById, servings)
          : []
        : getItemsLines(request.items, recipesById, ingredientsById);
    return lines.map((line) => ({
      line,
      id: getShoppingItemId(line.ingredientId, line.unit),
      name:
        ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient',
    }));
  }, [request, recipe, recipesById, ingredientsById, servings]);

  const isReady = isLoaded && loadError === null;
  const isOnList = (id: string) => onList.get(id)?.isChecked === false;
  const isTicked = (id: string) => choices[id] ?? !isOnList(id);
  const selected = rows.filter((row) => isTicked(row.id));
  const newCount = selected.filter((row) => !onList.has(row.id)).length;
  const isAllTicked = selected.length === rows.length;
  const label =
    request.kind === 'recipe' ? (recipe?.title ?? '') : request.label;

  const getBlock = () => {
    if (loadError !== null) {
      return "Your list couldn't load, so adding is paused.";
    }
    if (!isLoaded) {
      return 'Loading your list…';
    }
    if (selected.length === 0) {
      return rows.length === 0
        ? 'There is nothing here to add.'
        : 'Tick at least one to add it.';
    }
    if (selected.length > MAX_SHOPPING_LINES_PER_ADD) {
      return `Pick up to ${MAX_SHOPPING_LINES_PER_ADD} at a time.`;
    }
    if (listCount >= SOFT_MAX_SHOPPING_ITEMS && newCount > 0) {
      return "Your list is full. Take something off or clear what you've got in the Shopping tab.";
    }
    if (listCount + newCount > SOFT_MAX_SHOPPING_ITEMS) {
      return `Your list holds up to ${SOFT_MAX_SHOPPING_ITEMS}. Untick a few here, or clear what you've got in the Shopping tab.`;
    }
    return null;
  };
  const block = getBlock();

  const handleAdd = async () => {
    if (block !== null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const count = await dispatch(
        addToShoppingList({ uid, lines: selected.map((row) => row.line) }),
      ).unwrap();
      onClose();
      addToast({
        title:
          count === 1
            ? `Added ${selected[0].name} to your shopping list`
            : `Added ${count} to your shopping list`,
        type: 'success',
        action: {
          label: 'View',
          onClick: showShoppingTab,
        },
      });
    } catch (addError) {
      setError(
        getErrorMessage(addError, 'Unable to add to your shopping list.'),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Shopping list'>
      <div className='grid gap-4'>
        <div className='space-y-3'>
          <p className='text-lg font-medium wrap-break-word'>{label}</p>
          {recipe && (
            <div className='flex flex-wrap items-center gap-3'>
              <span className='text-sm'>For</span>
              <Stepper
                label='Servings'
                value={servings}
                onChange={setServings}
              />
              <span className='text-sm'>
                {servings === 1 ? 'serving' : 'servings'}
              </span>
            </div>
          )}
          {rows.length > 0 && (
            <div className='flex items-center justify-between gap-3'>
              <p className='text-muted-foreground text-sm'>
                {selected.length} of {rows.length}
              </p>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-10 px-0!'
                disabled={!isReady}
                onClick={() =>
                  setChoices(
                    Object.fromEntries(
                      rows.map((row) => [row.id, !isAllTicked]),
                    ),
                  )
                }
              >
                {isAllTicked ? 'Untick all' : 'Tick all'}
              </Button>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className='text-muted-foreground py-2 text-center text-sm'>
            There's nothing to buy here yet.
          </p>
        ) : (
          <ul className='divide-border max-h-[max(12rem,calc(92dvh-22rem))] divide-y overflow-y-auto'>
            {rows.map((row) => {
              const existing = onList.get(row.id);
              return (
                <li key={row.id}>
                  <label className='flex min-h-12 cursor-pointer items-start gap-3 py-2.5'>
                    <span className='mt-0.5 inline-flex shrink-0'>
                      <Checkbox
                        aria-label={`Add ${row.name}`}
                        checked={isTicked(row.id)}
                        disabled={!isReady}
                        onCheckedChange={(checked) =>
                          setChoices((current) => ({
                            ...current,
                            [row.id]: checked === true,
                          }))
                        }
                      />
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block wrap-break-word'>{row.name}</span>
                      {existing && isOnList(row.id) && (
                        <span className='text-muted-foreground block text-xs'>
                          On your list ·{' '}
                          {formatSize(existing.amount, existing.unit)}
                        </span>
                      )}
                    </span>
                    <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                      {formatSize(row.line.amount, row.line.unit)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          note={block}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSubmitting}
              disabled={isSubmitting || block !== null}
              onClick={() => void handleAdd()}
            >
              {selected.length > 0 ? `Add ${selected.length}` : 'Add'}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default AddToShoppingSheet;
