import { useCallback, useState } from 'react';

import { Button, Disclosure } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Plus } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import Subview from '@/components/Subview';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ShoppingAddSheet from '@apps/pinch/components/shopping/ShoppingAddSheet';
import ShoppingItemSheet from '@apps/pinch/components/shopping/ShoppingItemSheet';
import ShoppingRow from '@apps/pinch/components/shopping/ShoppingRow';
import {
  SHOPPING_GROUP_PAGE_SIZE,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  clearCheckedShoppingItems,
  setShoppingItemChecked,
} from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectShoppingById,
  selectShoppingCost,
  selectShoppingItems,
  selectShoppingLoadError,
  selectShoppingOpenCount,
  selectShoppingRows,
} from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import { formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import type { ShoppingRowData } from '@apps/pinch/utils/shopping';

const MAX_NAMES_SHOWN = 4;

const formatNames = (names: string[]) =>
  names.length <= MAX_NAMES_SHOWN
    ? names.join(', ')
    : `${names.slice(0, MAX_NAMES_SHOWN).join(', ')} and ${names.length - MAX_NAMES_SHOWN} more`;

interface ShoppingRowsProps {
  rows: ShoppingRowData[];
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

function ShoppingRows({ rows, onToggle, onOpen }: ShoppingRowsProps) {
  const [limit, setLimit] = useState(SHOPPING_GROUP_PAGE_SIZE);
  const visible = rows.length <= limit + 3 ? rows : rows.slice(0, limit);
  const hiddenCount = rows.length - visible.length;

  return (
    <>
      <ul className='divide-border divide-y'>
        {visible.map((row) => (
          <ShoppingRow
            key={row.id}
            {...row}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          onClick={() => setLimit(limit + SHOPPING_GROUP_PAGE_SIZE)}
        >
          Show {Math.min(hiddenCount, SHOPPING_GROUP_PAGE_SIZE)} more
        </Button>
      )}
    </>
  );
}

type Overlay = { kind: 'add' } | { kind: 'item'; id: string };

interface ShoppingSubviewProps {
  uid: string;
}

function ShoppingSubview({ uid }: ShoppingSubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { groups, checked } = useAppSelector(selectShoppingRows);
  const itemCount = useAppSelector(selectShoppingItems).length;
  const itemsById = useAppSelector(selectShoppingById);
  const openCount = useAppSelector(selectShoppingOpenCount);
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const cost = useAppSelector(selectShoppingCost);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [isGotOpen, setIsGotOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const isFull = itemCount >= SOFT_MAX_SHOPPING_ITEMS;
  const canAdd = loadError === null && !isFull;
  const openItem = overlay?.kind === 'item' ? itemsById.get(overlay.id) : null;

  const handleToggle = useCallback(
    (id: string, isChecked: boolean) => {
      dispatch(setShoppingItemChecked({ uid, id, isChecked }))
        .unwrap()
        .catch((error) =>
          addToast({
            title: "Couldn't update your list",
            description: getErrorMessage(error, 'Please try again.'),
            type: 'error',
          }),
        );
    },
    [dispatch, uid, addToast],
  );
  const handleOpen = useCallback(
    (id: string) => setOverlay({ kind: 'item', id }),
    [],
  );

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Clear what you got',
      message: `Take ${checked.length === 1 ? 'the 1 item' : `the ${checked.length} items`} you've got off your list? This action cannot be undone.`,
      confirmText: 'Clear',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsClearing(true);
    try {
      await dispatch(clearCheckedShoppingItems({ uid })).unwrap();
    } catch (error) {
      addToast({
        title: "Couldn't clear your list",
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const getSubtitle = () => {
    if (openCount > 0) return `${openCount} to buy`;
    return checked.length > 0 ? 'Got everything' : undefined;
  };

  const getLeftOutNames = (kind: Gap['kind']) =>
    cost.leftOut
      .filter((gap) => gap.kind === kind)
      .map(
        (gap) =>
          ingredientsById.get(gap.ingredientId)?.name ?? 'Removed ingredient',
      );
  const noProductNames = getLeftOutNames('NO_PRODUCT');
  const notComparableNames = getLeftOutNames('NOT_COMPARABLE');

  const getBody = () => {
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          We couldn't load your shopping list just now. Check your connection
          and try again.
        </p>
      );
    }
    if (!isLoaded) {
      return null;
    }
    if (itemCount === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Nothing on your list. Add a recipe's ingredients from its page, or add
          one here.
        </p>
      );
    }
    return (
      <>
        {groups.map((group) => (
          <section
            key={group.id || 'other'}
            aria-label={group.name}
            className='space-y-1'
          >
            <SectionDivider label={group.name} />
            <ShoppingRows
              rows={group.rows}
              onToggle={handleToggle}
              onOpen={handleOpen}
            />
          </section>
        ))}
        {groups.length === 0 && (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            You've got everything. Clear it when you're ready for the next list.
          </p>
        )}
        {checked.length > 0 && (
          <div className='relative'>
            <Disclosure
              label={`Got it · ${checked.length}`}
              isOpen={isGotOpen}
              onToggle={setIsGotOpen}
              buttonClassName='min-h-10 px-0! py-2 pr-20! hover:bg-transparent!'
            >
              {isGotOpen && (
                <ShoppingRows
                  rows={checked}
                  onToggle={handleToggle}
                  onOpen={handleOpen}
                />
              )}
            </Disclosure>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              rounded='full'
              loading={isClearing}
              disabled={isClearing}
              className='absolute top-0 right-0 h-10'
              onClick={() => void handleClear()}
            >
              Clear
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <Subview title='Shopping list' onClose={closeSubview}>
      <div className='space-y-4'>
        <SectionHeader
          title='Shopping list'
          subtitle={getSubtitle()}
          action={
            canAdd ? (
              <Button
                type='button'
                size='sm'
                rounded='full'
                className='gap-1'
                onClick={() => setOverlay({ kind: 'add' })}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add
              </Button>
            ) : undefined
          }
        />
        {isFull && loadError === null && (
          <p className='text-muted-foreground text-sm'>
            Your list is full: clear what you've bought.
          </p>
        )}
        {openCount > 0 && (
          <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            {cost.totalCents === null ? (
              'No prices yet'
            ) : (
              <span>
                About{' '}
                <span className='text-foreground font-semibold'>
                  {formatCost(cost.totalCents)}
                </span>{' '}
                for what's left
              </span>
            )}
            {cost.leftOut.length > 0 && (
              <HelpTip
                variant='warning'
                title="What's left out"
                placement='top'
              >
                <p>This {formatLeftOut(cost.leftOut)}.</p>
                {noProductNames.length > 0 && (
                  <p className='text-muted-foreground'>
                    No price yet: {formatNames(noProductNames)}.
                  </p>
                )}
                {notComparableNames.length > 0 && (
                  <p className='text-muted-foreground'>
                    Can't compare the amount with the package size:{' '}
                    {formatNames(notComparableNames)}.
                  </p>
                )}
              </HelpTip>
            )}
          </p>
        )}
        {getBody()}
      </div>
      {overlay?.kind === 'add' && (
        <ShoppingAddSheet uid={uid} onClose={() => setOverlay(null)} />
      )}
      {openItem && (
        <ShoppingItemSheet
          key={openItem.id}
          uid={uid}
          item={openItem}
          onClose={() => setOverlay(null)}
        />
      )}
    </Subview>
  );
}

export default ShoppingSubview;
