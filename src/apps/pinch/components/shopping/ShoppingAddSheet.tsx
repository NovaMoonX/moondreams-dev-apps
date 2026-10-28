import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Check } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import { ShoppingPick } from '@apps/pinch/components/shared/AddToShoppingSheet';
import {
  DEFAULT_SERVING,
  SHOPPING_ADD_MODE_LABELS,
  SHOPPING_ADD_MODES,
  SOFT_MAX_SHOPPING_ITEMS,
  type ShoppingAddMode,
} from '@apps/pinch/constants';
import { addToShoppingList } from '@apps/pinch/store/actions/shoppingActions';
import {
  selectCookSummaries,
  selectIngredientsById,
  selectPlannedByDay,
  selectRecipes,
  selectShoppingById,
  selectShoppingItems,
  selectShoppingLoadError,
} from '@apps/pinch/store/selectors';
import { addDaysToKey } from '@apps/pinch/utils/dayKeys';
import { getShoppingPickIds } from '@apps/pinch/utils/pickerSuggestions';
import { getShoppingItemId } from '@apps/pinch/utils/shopping';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';

const PLAN_DAYS = 7;

interface ShoppingAddSheetProps {
  uid: string;
  onClose: () => void;
}

function ShoppingAddSheet({ uid, onClose }: ShoppingAddSheetProps) {
  const dispatch = useAppDispatch();
  const ingredientsById = useAppSelector(selectIngredientsById);
  const onList = useAppSelector(selectShoppingById);
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const items = useAppSelector(selectShoppingItems);
  const recipes = useAppSelector(selectRecipes);
  const cookSummaries = useAppSelector(selectCookSummaries);
  const [todayKey] = useState(() => toLocalDateInputValue(Date.now()));
  const [mode, setMode] = useState<ShoppingAddMode>('one');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [searchKey, setSearchKey] = useState(0);
  const fieldRef = useRef<HTMLDivElement>(null);

  const hasPlan = [...plannedByDay.keys()].some((dayKey) => dayKey >= todayKey);
  const shownMode = hasPlan ? mode : 'one';
  const isReady = isLoaded && loadError === null;
  const getNote = () => {
    if (loadError !== null)
      return "Your list couldn't load, so adding is paused.";
    if (!isLoaded) return 'Loading your list…';
    return isAdding ? 'Adding…' : null;
  };
  const note = getNote();
  const suggestedIds = useMemo(
    () =>
      shownMode === 'one' && isReady
        ? getShoppingPickIds(items, recipes, cookSummaries)
        : [],
    [shownMode, isReady, items, recipes, cookSummaries],
  );

  // The drawer takes focus itself while it slides in, so the field is focused once that settles.
  useEffect(() => {
    if (!canFocusFieldOnOpen()) return;
    const timer = window.setTimeout(
      () => fieldRef.current?.querySelector('input')?.focus(),
      350,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const handleModeChange = (next: ShoppingAddMode) => {
    setMode(next);
    if (next === 'one') {
      window.setTimeout(
        () => fieldRef.current?.querySelector('input')?.focus(),
        0,
      );
    }
  };

  const handlePick = async (ingredientId: string) => {
    if (isAdding || !isReady) {
      return;
    }
    const ingredient = ingredientsById.get(ingredientId);
    const serving = ingredient?.serving ?? DEFAULT_SERVING;
    const isNewLine = !onList.has(
      getShoppingItemId(ingredientId, serving.unit),
    );
    if (isNewLine && onList.size >= SOFT_MAX_SHOPPING_ITEMS) {
      setError(
        "Your list is full: take something off or clear what you've got.",
      );
      return;
    }

    setError(null);
    setIsAdding(true);
    try {
      await dispatch(
        addToShoppingList({
          uid,
          lines: [
            {
              ingredientId,
              amount: serving.amount,
              unit: serving.unit,
              source: null,
            },
          ],
        }),
      ).unwrap();
      setAdded((current) => [...current, ingredient?.name ?? 'it']);
      setSearchKey((current) => current + 1);
      // The picked result unmounts with the old field, and the drawer takes focus back first.
      window.setTimeout(
        () => fieldRef.current?.querySelector('input')?.focus(),
        120,
      );
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to add this to your list.'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Shopping list'>
      <div className='space-y-4'>
        {hasPlan && (
          <PillGroup
            label='What to add'
            options={SHOPPING_ADD_MODES.map((value) => ({
              value,
              label: SHOPPING_ADD_MODE_LABELS[value],
            }))}
            value={shownMode}
            onChange={handleModeChange}
            isThin
          />
        )}
        {shownMode === 'plan' ? (
          <ShoppingPick
            uid={uid}
            request={{
              kind: 'range',
              startKey: todayKey,
              endKey: addDaysToKey(todayKey, PLAN_DAYS - 1),
            }}
            onClose={onClose}
            columnClassName='max-h-[max(22rem,calc(92dvh-19rem))]'
            hasViewAction={false}
          />
        ) : (
          <div className='space-y-3 pb-4 [@media(max-height:499px)]:pb-0'>
            <p className='text-muted-foreground text-sm [@media(max-height:499px)]:hidden'>
              What do you need? It goes on the list at a typical serving, and
              the arrow beside it on the list changes how much.
            </p>
            <div ref={fieldRef}>
              <ItemSearch
                key={searchKey}
                uid={uid}
                isDisabled={isAdding || !isReady}
                suggestions={{
                  caption: 'From your list and your cooking',
                  ids: suggestedIds,
                }}
                isCapped
                onPick={(ingredientId) => void handlePick(ingredientId)}
              />
            </div>
            {note && (
              <p className='text-muted-foreground text-sm' role='status'>
                {note}
              </p>
            )}
            {!note && added.length > 0 && (
              <p className='flex items-start gap-1.5 text-sm' role='status'>
                <Check
                  className='mt-0.5 h-4 w-4 shrink-0 text-[var(--pinch-drizzle)]'
                  aria-hidden='true'
                />
                <span className='min-w-0 wrap-break-word'>
                  Added {added.at(-1)}
                  {added.length > 1 && (
                    <span className='text-muted-foreground whitespace-nowrap'>
                      {' '}
                      · {added.length} so far
                    </span>
                  )}
                </span>
              </p>
            )}
            {error && <p className='text-destructive text-sm'>{error}</p>}
            {added.length > 0 && (
              <ModalFooterActions
                rightActions={
                  <Button type='button' onClick={onClose}>
                    Done
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>
    </FormSheet>
  );
}

export default ShoppingAddSheet;
