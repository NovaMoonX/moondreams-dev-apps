import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { Button, Disclosure } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Plus } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ShoppingAddSheet from '@apps/pinch/components/shopping/ShoppingAddSheet';
import ShoppingItemSheet from '@apps/pinch/components/shopping/ShoppingItemSheet';
import ShoppingRow from '@apps/pinch/components/shopping/ShoppingRow';
import {
  LIST_SEARCH_THRESHOLD,
  SHOPPING_GROUP_PAGE_SIZE,
  SHOPPING_MOVE_DELAY_MS,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
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
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import type {
  ShoppingGroup,
  ShoppingRowData,
} from '@apps/pinch/utils/shopping';

const EAGER_GROUPS = 3;
const ROW_HEIGHT = 57;
const DIVIDER_HEIGHT = 36;

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

interface ShoppingGroupSectionProps {
  group: ShoppingGroup;
  isEager: boolean;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

const isSameRow = (a: ShoppingRowData, b: ShoppingRowData) =>
  a.id === b.id &&
  a.name === b.name &&
  a.amount === b.amount &&
  a.unit === b.unit &&
  a.isChecked === b.isChecked;

const isSameGroup = (a: ShoppingGroup, b: ShoppingGroup) =>
  a.id === b.id &&
  a.name === b.name &&
  a.rows.length === b.rows.length &&
  a.rows.every((row, index) => isSameRow(row, b.rows[index]));

const ShoppingGroupSection = memo(
  function ShoppingGroupSection({
    group,
    isEager,
    onToggle,
    onOpen,
  }: ShoppingGroupSectionProps) {
    const estimatedHeight = DIVIDER_HEIGHT + group.rows.length * ROW_HEIGHT;

    return (
      <section
        aria-label={group.name}
        className='defer-offscreen space-y-1 lg:mb-4 lg:break-inside-avoid'
        style={{ '--defer-size': `${estimatedHeight}px` } as CSSProperties}
      >
        <LazyMount estimatedHeight={estimatedHeight} eager={isEager}>
          <SectionDivider label={group.name} />
          <ShoppingRows rows={group.rows} onToggle={onToggle} onOpen={onOpen} />
        </LazyMount>
      </section>
    );
  },
  (prev, next) =>
    prev.isEager === next.isEager &&
    prev.onToggle === next.onToggle &&
    prev.onOpen === next.onOpen &&
    isSameGroup(prev.group, next.group),
);

const NO_HELD: ReadonlyMap<string, boolean> = new Map();

/** Holding renders nothing: the store update that follows the write does, and only letting go renders. */
function useHeldRows() {
  const held = useRef(NO_HELD);
  const timers = useRef(new Map<string, number>());
  const [, release] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const hold = useCallback((id: string, wasGot: boolean) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id);
        const next = new Map(held.current);
        next.delete(id);
        held.current = next.size === 0 ? NO_HELD : next;
        release();
      }, SHOPPING_MOVE_DELAY_MS),
    );
    held.current = held.current.has(id)
      ? held.current
      : new Map(held.current).set(id, wasGot);
  }, []);

  return { held, hold };
}

type Overlay = { kind: 'add' } | { kind: 'item'; id: string };

interface ShoppingScreenProps {
  uid: string;
}

function ShoppingScreen({ uid }: ShoppingScreenProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { held, hold } = useHeldRows();
  const { groups, checked } = useAppSelector((state) =>
    selectShoppingRows(state, held.current),
  );
  const itemCount = useAppSelector(selectShoppingItems).length;
  const itemsById = useAppSelector(selectShoppingById);
  const openCount = useAppSelector(selectShoppingOpenCount);
  const gotCount = itemCount - openCount;
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const cost = useAppSelector(selectShoppingCost);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [isGotOpen, setIsGotOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [query, setQuery] = useState('');

  const isFull = itemCount >= SOFT_MAX_SHOPPING_ITEMS;
  const canAdd = loadError === null && !isFull;
  const openItem = overlay?.kind === 'item' ? itemsById.get(overlay.id) : null;
  const hasSearch = itemCount >= LIST_SEARCH_THRESHOLD;
  const activeQuery = hasSearch ? query.trim() : '';
  const shownGroups = useMemo(
    () =>
      activeQuery === ''
        ? groups
        : groups
            .map((group) => ({
              ...group,
              rows: searchByName(group.rows, activeQuery),
            }))
            .filter((group) => group.rows.length > 0),
    [groups, activeQuery],
  );
  const shownChecked = useMemo(
    () => searchByName(checked, activeQuery),
    [checked, activeQuery],
  );

  const handleToggle = useCallback(
    (id: string, isChecked: boolean) => {
      hold(id, !isChecked);
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
    [dispatch, uid, addToast, hold],
  );
  const handleOpen = useCallback(
    (id: string) => setOverlay({ kind: 'item', id }),
    [],
  );

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Clear what you got',
      message: `Take ${gotCount === 1 ? 'the 1 item' : `the ${gotCount} items`} you've got off your list? This action cannot be undone.`,
      confirmText: 'Clear',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsClearing(true);
    try {
      const deleted = await dispatch(
        clearCheckedShoppingItems({ uid }),
      ).unwrap();
      addToast({
        title:
          deleted === 0
            ? 'Nothing was left to clear'
            : `Cleared ${deleted === 1 ? '1 item' : `${deleted} items`}`,
        description:
          deleted < gotCount ? 'The rest changed in the meantime.' : undefined,
        type: deleted === 0 ? 'info' : 'success',
      });
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
    return gotCount > 0 ? 'Got everything' : undefined;
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
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your list…
        </p>
      );
    }
    if (itemCount === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Nothing on your list. Add what you need from a recipe, a meal or a
          day, or add one here.
        </p>
      );
    }
    return (
      <>
        <div className='space-y-4 lg:block lg:columns-2 lg:space-y-0 lg:gap-x-8'>
          {shownGroups.map((group, index) => (
            <ShoppingGroupSection
              key={group.id || 'other'}
              group={group}
              isEager={index < EAGER_GROUPS}
              onToggle={handleToggle}
              onOpen={handleOpen}
            />
          ))}
        </div>
        {activeQuery === '' && groups.length === 0 && (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            You've got everything. Clear it when you're ready for the next list.
          </p>
        )}
        {activeQuery !== '' &&
          shownGroups.length === 0 &&
          shownChecked.length === 0 && (
            <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
              Nothing on your list matches “{activeQuery}”.
            </p>
          )}
        {shownChecked.length > 0 && (
          <div className='relative'>
            <Disclosure
              label={
                shownChecked.length === checked.length
                  ? `Got it · ${checked.length}`
                  : `Got it · ${shownChecked.length} of ${checked.length}`
              }
              isOpen={isGotOpen}
              onToggle={setIsGotOpen}
              buttonClassName='min-h-10 px-0! py-2 pr-20! hover:bg-transparent! [&>div>span]:flex-none'
            >
              {isGotOpen && (
                <ShoppingRows
                  rows={shownChecked}
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
          Your list is full: take something off or clear what you've got.
        </p>
      )}
      {openCount > 0 && (
        <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
          {cost.totalCents === null ? (
            'No prices yet'
          ) : (
            <span>
              Amounts on your list: about{' '}
              <span className='text-foreground font-semibold'>
                {formatCost(cost.totalCents)}
              </span>
            </span>
          )}
          <HelpTip
            variant={cost.leftOut.length > 0 ? 'warning' : 'help'}
            title='About this price'
            placement='top'
          >
            <p>
              This prices just the amounts on your list, from each ingredient's
              default product. Stores sell whole packages, so what you pay at
              the till is usually more.
            </p>
            {cost.leftOut.length > 0 && (
              <p>This {formatLeftOut(cost.leftOut)}.</p>
            )}
            {noProductNames.length > 0 && (
              <p className='text-muted-foreground'>
                No price yet: {formatNames(noProductNames)}. Add a price from
                the ingredient in Kitchen.
              </p>
            )}
            {notComparableNames.length > 0 && (
              <p className='text-muted-foreground'>
                Can't compare the amount with the package size:{' '}
                {formatNames(notComparableNames)}. Change the package size from
                the ingredient in Kitchen.
              </p>
            )}
          </HelpTip>
        </p>
      )}
      {hasSearch && loadError === null && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder='Search your list'
        />
      )}
      {getBody()}
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
    </div>
  );
}

export default memo(ShoppingScreen);
