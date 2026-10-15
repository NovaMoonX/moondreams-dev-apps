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

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ShoppingAddSheet from '@apps/pinch/components/shopping/ShoppingAddSheet';
import ShoppingItemSheet from '@apps/pinch/components/shopping/ShoppingItemSheet';
import ShoppingRow from '@apps/pinch/components/shopping/ShoppingRow';
import {
  LIST_SEARCH_THRESHOLD,
  SHOP_SECTION_DIVIDER_MIN_ROWS,
  SHOPPING_GROUP_PAGE_SIZE,
  SHOPPING_MOVE_DELAY_MS,
  SHOPPING_VIEW_LABELS,
  SHOPPING_VIEWS,
  SOFT_MAX_SHOPPING_ITEMS,
} from '@apps/pinch/constants';
import {
  clearCheckedShoppingItems,
  removeShoppingItem,
  restoreShoppingItems,
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
  selectShoppingSourceLabels,
} from '@apps/pinch/store/selectors';
import type { Gap, ShoppingItem, ShoppingView } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getShoppingCostCoverage,
  getShoppingSourcesText,
  getShopRowId,
  getShownShoppingView,
  type ShoppingGroup,
  type ShoppingRowData,
} from '@apps/pinch/utils/shopping';

const EAGER_GROUPS = 3;
const ROW_CHUNK = 12;
const ROW_HEIGHT = 57;

const MAX_NAMES_SHOWN = 4;
const UNDO_TOAST_MS = 6000;

const undone = new Set<string>();

const countRows = (groups: ShoppingGroup[]) =>
  groups.reduce((sum, group) => sum + group.rows.length, 0);

const filterGroups = (groups: ShoppingGroup[], query: string) =>
  query === ''
    ? groups
    : groups
        .map((group) => ({
          ...group,
          rows: searchByName(group.rows, query),
        }))
        .filter((group) => group.rows.length > 0);

const formatNames = (names: string[]) =>
  names.length <= MAX_NAMES_SHOWN
    ? names.join(', ')
    : `${names.slice(0, MAX_NAMES_SHOWN).join(', ')} and ${names.length - MAX_NAMES_SHOWN} more`;

type GetForText = (sources: string[]) => string | null;

interface ShoppingRowsProps {
  rows: ShoppingRowData[];
  getForText: GetForText;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
  /** Whether the first chunk of rows mounts at once, for the first screenful. */
  isEager?: boolean;
  className?: string;
}

function ShoppingRows({
  rows,
  getForText,
  onToggle,
  onOpen,
  isEager = true,
  className,
}: ShoppingRowsProps) {
  const [limit, setLimit] = useState(SHOPPING_GROUP_PAGE_SIZE);
  const visible = rows.length <= limit + 3 ? rows : rows.slice(0, limit);
  const hiddenCount = rows.length - visible.length;
  const chunks = Array.from(
    { length: Math.ceil(visible.length / ROW_CHUNK) },
    (_, index) => visible.slice(index * ROW_CHUNK, (index + 1) * ROW_CHUNK),
  );

  return (
    <>
      <div className={join('divide-border divide-y', className)}>
        {chunks.map((chunk, index) => (
          <LazyMount
            key={index}
            estimatedHeight={chunk.length * ROW_HEIGHT}
            eager={isEager && index === 0}
          >
            <ul
              className='divide-border defer-offscreen divide-y lg:break-inside-avoid'
              style={
                {
                  '--defer-size': `${chunk.length * ROW_HEIGHT}px`,
                } as CSSProperties
              }
            >
              {chunk.map((row) => (
                <ShoppingRow
                  key={row.id}
                  id={row.id}
                  name={row.name}
                  amountText={row.amountText}
                  forText={getForText(row.sources)}
                  isChecked={row.isChecked}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </LazyMount>
        ))}
      </div>
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
  getForText: GetForText;
  onToggle: (id: string, isChecked: boolean) => void;
  onOpen: (id: string) => void;
}

const isSameRow = (a: ShoppingRowData, b: ShoppingRowData) =>
  a.id === b.id &&
  a.name === b.name &&
  a.amountText === b.amountText &&
  a.isChecked === b.isChecked &&
  a.itemIds.join() === b.itemIds.join() &&
  a.sources.join() === b.sources.join();

const isSameGroup = (a: ShoppingGroup, b: ShoppingGroup) =>
  a.id === b.id &&
  a.name === b.name &&
  a.rows.length === b.rows.length &&
  a.rows.every((row, index) => isSameRow(row, b.rows[index]));

const ShoppingGroupSection = memo(
  function ShoppingGroupSection({
    group,
    isEager,
    getForText,
    onToggle,
    onOpen,
  }: ShoppingGroupSectionProps) {
    return (
      <section aria-label={group.name} className='space-y-1 lg:mb-4'>
        <SectionDivider label={group.name} className='lg:break-after-avoid' />
        <ShoppingRows
          rows={group.rows}
          isEager={isEager}
          getForText={getForText}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      </section>
    );
  },
  (prev, next) =>
    prev.isEager === next.isEager &&
    prev.getForText === next.getForText &&
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
  const { addToast, removeToast } = useToast();
  const { held, hold } = useHeldRows();
  const rows = useAppSelector((state) =>
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
  const sourceLabels = useAppSelector(selectShoppingSourceLabels);
  const [todayKey] = useState(() => toLocalDateInputValue(Date.now()));
  const getForText = useCallback(
    (sources: string[]) =>
      getShoppingSourcesText(sources, sourceLabels, todayKey),
    [sourceLabels, todayKey],
  );
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<{ view: ShoppingView; query: string }>({
    view: 'toBuy',
    query: '',
  });

  const isFull = itemCount >= SOFT_MAX_SHOPPING_ITEMS;
  const canAdd = loadError === null && !isFull;
  const rowsById = useMemo(
    () =>
      new Map(
        [...rows.toBuy, ...rows.got]
          .flatMap((group) => group.rows)
          .map((row) => [row.id, row]),
      ),
    [rows],
  );
  const rowsByIdRef = useRef(rowsById);
  useEffect(() => {
    rowsByIdRef.current = rowsById;
  }, [rowsById]);
  const openRow = overlay?.kind === 'item' ? rowsById.get(overlay.id) : null;
  const openItems = (openRow?.itemIds ?? []).flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
  const hasSearch = itemCount >= LIST_SEARCH_THRESHOLD;
  const activeQuery = hasSearch ? query.trim() : '';
  const found = useMemo(
    () => ({
      toBuy: filterGroups(rows.toBuy, activeQuery),
      got: filterGroups(rows.got, activeQuery),
    }),
    [rows, activeQuery],
  );
  const matches = {
    toBuy: countRows(found.toBuy),
    got: countRows(found.got),
  };
  const shownView = getShownShoppingView(pick, activeQuery, matches);
  const shownGroups = found[shownView];
  const switchOptions = SHOPPING_VIEWS.map((value) => ({
    value,
    label: `${SHOPPING_VIEW_LABELS[value]} · ${matches[value]}`,
  }));

  const handleToggle = useCallback(
    (id: string, isChecked: boolean) => {
      const ids = rowsByIdRef.current.get(id)?.itemIds ?? [];
      ids.forEach((itemId) => hold(itemId, !isChecked));
      dispatch(setShoppingItemChecked({ uid, ids, isChecked }))
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

  const addUndoToast = (
    title: string,
    description: string | undefined,
    undo: () => Promise<void>,
  ) => {
    const id = generateUuid();
    addToast({
      id,
      title,
      description,
      type: 'success',
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          removeToast(id);
          if (undone.has(id)) return;

          undone.add(id);
          void undo();
        },
      },
    });
  };

  const restore = async (items: ShoppingItem[]) => {
    try {
      const restored = await dispatch(
        restoreShoppingItems({ uid, items }),
      ).unwrap();
      if (restored < items.length) {
        addToast({
          title:
            restored === 0
              ? 'Already back on your list'
              : `Put back ${restored} of ${items.length}`,
          description: 'What is on your list again keeps what it has.',
          type: 'info',
        });
      }
    } catch (error) {
      addToast({
        title: "Couldn't undo that",
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const handleRemove = (name: string, items: ShoppingItem[]) => {
    setOverlay(null);
    const removal = dispatch(
      removeShoppingItem({ uid, ids: items.map((item) => item.id) }),
    ).unwrap();
    removal.catch((error) =>
      addToast({
        title: `Couldn't take ${name} off your list`,
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      }),
    );
    addUndoToast(`Removed ${name}`, undefined, () =>
      removal.then(
        () => restore(items),
        () => undefined,
      ),
    );
  };

  const handleClear = async () => {
    if (isClearing) {
      return;
    }
    setIsClearing(true);
    try {
      const cleared = await dispatch(
        clearCheckedShoppingItems({ uid }),
      ).unwrap();
      const clearedRows = new Set(
        cleared.map((item) => getShopRowId(item.ingredientId, item.unit)),
      ).size;
      if (clearedRows === 0) {
        addToast({ title: 'Nothing was left to clear', type: 'info' });
        return;
      }
      addUndoToast(
        `Cleared ${clearedRows === 1 ? '1 item' : `${clearedRows} items`}`,
        cleared.length < gotCount
          ? 'The rest changed in the meantime.'
          : undefined,
        () => restore(cleared),
      );
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

  const getLeftOutNames = (kind: Gap['kind']) =>
    cost.leftOut
      .filter((gap) => gap.kind === kind)
      .map(
        (gap) =>
          ingredientsById.get(gap.ingredientId)?.name ?? 'Removed ingredient',
      );
  const noProductNames = getLeftOutNames('NO_PRODUCT');
  const coverage = getShoppingCostCoverage(cost);
  const getCoveredText = () => {
    if (coverage === 'some') {
      return `for ${cost.pricedRowCount} of ${cost.rowCount} things`;
    }
    return cost.rowCount === 1
      ? 'for the 1 thing'
      : `for all ${cost.rowCount} things`;
  };
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
    const isSearching = activeQuery !== '';
    const getEmpty = () => {
      if (isSearching) {
        return (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing on your list matches “{activeQuery}”.
          </p>
        );
      }
      if (shownView === 'got') {
        return (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            Nothing ticked off yet. What you tick as you shop lands here.
          </p>
        );
      }
      return (
        <div className='space-y-3 py-6 text-center'>
          <p className='text-muted-foreground text-sm'>
            Nothing left to buy. {gotCount === 1 ? '1 is' : `${gotCount} are`}{' '}
            ticked off under Got it.
          </p>
          <Button
            type='button'
            variant='secondary'
            className='h-10'
            onClick={() => setPick({ view: 'got', query: activeQuery })}
          >
            See what you got
          </Button>
        </div>
      );
    };
    return (
      <>
        {shownView === 'got' && !isSearching && gotCount > 0 && (
          <div className='flex min-h-10 items-center justify-end'>
            <Button
              type='button'
              variant='link'
              size='sm'
              loading={isClearing}
              disabled={isClearing}
              className="relative h-6! min-h-0! px-0! py-0! before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
              onClick={() => void handleClear()}
            >
              Clear what you got
            </Button>
          </div>
        )}
        {shownGroups.length === 0 && getEmpty()}
        {shownGroups.length > 0 &&
          matches[shownView] < SHOP_SECTION_DIVIDER_MIN_ROWS && (
            <ShoppingRows
              key={shownView}
              rows={shownGroups.flatMap((group) => group.rows)}
              getForText={getForText}
              onToggle={handleToggle}
              onOpen={handleOpen}
              className='lg:w-[calc(50%-1rem)]'
            />
          )}
        {matches[shownView] >= SHOP_SECTION_DIVIDER_MIN_ROWS && (
          <div className='space-y-4 lg:block lg:columns-2 lg:space-y-0 lg:gap-x-8'>
            {shownGroups.map((group, index) => (
              <ShoppingGroupSection
                key={`${shownView}-${group.id}`}
                group={group}
                isEager={index < EAGER_GROUPS}
                getForText={getForText}
                onToggle={handleToggle}
                onOpen={handleOpen}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Shopping list'
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
      {loadError === null && isLoaded && itemCount > 0 && (
        <PillGroup
          label='Which part of the list'
          options={switchOptions}
          value={shownView}
          onChange={(next) => setPick({ view: next, query: activeQuery })}
          isThin
        />
      )}
      {openCount > 0 && shownView === 'toBuy' && (
        <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
          {coverage === 'none' && 'No price yet'}
          {coverage === 'tooFew' && 'Not enough prices yet'}
          {(coverage === 'some' || coverage === 'all') && (
            <span>
              About{' '}
              <span className='text-foreground font-semibold'>
                {formatCost(cost.totalCents ?? 0)}
              </span>{' '}
              {getCoveredText()}
            </span>
          )}
          <HelpTip
            variant={cost.leftOut.length > 0 ? 'warning' : 'help'}
            title='About this price'
            placement='top'
            dismissLabel='OK'
          >
            {(coverage === 'some' || coverage === 'all') && (
              <p>
                It prices the amounts on your list, not whole packages, so the
                till total is usually more.
              </p>
            )}
            {noProductNames.length > 0 && (
              <p>
                Not priced yet: {formatNames(noProductNames)}. Prices come from
                what you've told Pinch about where you buy things.
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
      {openRow && openItems.length > 0 && (
        <ShoppingItemSheet
          key={openRow.id}
          uid={uid}
          name={openRow.name}
          forText={getForText(openRow.sources)}
          items={openItems}
          onClose={() => setOverlay(null)}
          onRemove={() => handleRemove(openRow.name, openItems)}
        />
      )}
    </div>
  );
}

export default memo(ShoppingScreen);
