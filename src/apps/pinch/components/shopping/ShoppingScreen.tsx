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
import {
  BrushCleaning,
  Package as PackageIcon,
  Plus,
  UtensilsCrossed,
} from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import EntryTile from '@/components/EntryTile';
import HelpTip from '@/components/HelpTip';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import PantryFromShoppingSheet, {
  type PutAwayRow,
} from '@apps/pinch/components/pantry/PantryFromShoppingSheet';
import ShoppingAddSheet from '@apps/pinch/components/shopping/ShoppingAddSheet';
import ShoppingItemSheet from '@apps/pinch/components/shopping/ShoppingItemSheet';
import ShoppingMealsSheet from '@apps/pinch/components/shopping/ShoppingMealsSheet';
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
import { useShoppingPutAway } from '@apps/pinch/hooks/useShoppingPutAway';
import {
  clearCheckedShoppingItems,
  removeShoppingItem,
  restoreShoppingItems,
  setShoppingItemChecked,
} from '@apps/pinch/store/actions/shoppingActions';
import {
  selectIngredientsById,
  selectIsPackagesReady,
  selectShoppingById,
  selectShoppingCost,
  selectShoppingItems,
  selectShoppingLoadError,
  selectShoppingMeals,
  selectShoppingOpenCount,
  selectShoppingRows,
  selectShoppingSourceLabels,
} from '@apps/pinch/store/selectors';
import type {
  Gap,
  ShoppingHalf,
  ShoppingItem,
  ShoppingView,
} from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getShoppingCostCoverage,
  getShoppingMealsText,
  getShoppingSourcesText,
  getShopRowId,
  getShownShoppingView,
  sumShopAmounts,
  type ShoppingGroup,
  type ShoppingRowData,
  type ShoppingSourceLabel,
} from '@apps/pinch/utils/shopping';

const EAGER_GROUPS = 3;
const ROW_CHUNK = 12;
const ROW_HEIGHT = 57;
const DETAIL_LINE_HEIGHT = 16;
const DETAIL_LINE_CHARS = 44;

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

// Rows share sources, and every render and height estimate asks again, so each set is worked out once per change of names.
const makeForText = (
  labels: Map<string, ShoppingSourceLabel>,
  todayKey: string,
): GetForText => {
  const textBySources = new Map<string, string | null>();
  return (sources) => {
    const key = sources.join('|');
    const known = textBySources.get(key);
    if (known !== undefined) return known;
    const text = getShoppingSourcesText(sources, labels, todayKey);
    textBySources.set(key, text);
    return text;
  };
};

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
  const getChunkHeight = (chunk: ShoppingRowData[]) =>
    chunk.reduce((sum, row) => {
      const detail = `${row.amountText ?? ''} · for ${getForText(row.sources) ?? ''}`;
      return detail.length > DETAIL_LINE_CHARS
        ? sum + ROW_HEIGHT + DETAIL_LINE_HEIGHT
        : sum + ROW_HEIGHT;
    }, 0);

  return (
    <>
      <div className={join('divide-border divide-y', className)}>
        {chunks.map((chunk, index) => (
          <LazyMount
            key={index}
            estimatedHeight={getChunkHeight(chunk)}
            eager={isEager && index === 0}
          >
            <ul
              className='divide-border defer-offscreen divide-y lg:break-inside-avoid'
              style={
                {
                  '--defer-size': `${getChunkHeight(chunk)}px`,
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
        <ShowMoreButton
          onClick={() => setLimit(limit + SHOPPING_GROUP_PAGE_SIZE)}
        >
          Show {Math.min(hiddenCount, SHOPPING_GROUP_PAGE_SIZE)} more
        </ShowMoreButton>
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

type Overlay =
  | { kind: 'add' }
  | { kind: 'item'; id: string }
  | { kind: 'meals' }
  | { kind: 'pantry'; rows: PutAwayRow[] };

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
  const items = useAppSelector(selectShoppingItems);
  const itemCount = items.length;
  const itemsById = useAppSelector(selectShoppingById);
  const openCount = useAppSelector(selectShoppingOpenCount);
  const gotCount = countRows(rows.got);
  const gotItemCount = items.filter((item) => item.isChecked).length;
  const loadError = useAppSelector(selectShoppingLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.shopping.isLoaded);
  const cost = useAppSelector(selectShoppingCost);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const sourceLabels = useAppSelector(selectShoppingSourceLabels);
  const [todayKey] = useState(() => toLocalDateInputValue(Date.now()));
  const getForText = useMemo(
    () => makeForText(sourceLabels, todayKey),
    [sourceLabels, todayKey],
  );
  const meals = useAppSelector((state) => selectShoppingMeals(state, todayKey));
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const isPantryReady = useAppSelector(selectIsPackagesReady);
  const { isPutAway, markPutAway } = useShoppingPutAway(uid);
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
  // What came home and has not been offered to the pantry yet, one line per ingredient.
  const putAwayRows = rows.got
    .flatMap((group) => group.rows)
    .flatMap((row): PutAwayRow[] => {
      const rowItems = row.itemIds.flatMap((id) => {
        const item = itemsById.get(id);
        return item ? [item] : [];
      });
      if (rowItems.length === 0 || rowItems.every(isPutAway)) return [];

      const total = sumShopAmounts(rowItems);
      return [
        {
          id: row.id,
          ingredientId: rowItems[0].ingredientId,
          name: row.name,
          items: rowItems.map(({ id, updatedAt }) => ({ id, updatedAt })),
          amount: total?.amount ?? null,
          unit: total?.unit ?? 'EACH',
        },
      ];
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
  const counts: Record<ShoppingView, number> = {
    ...matches,
    all: matches.toBuy + matches.got,
  };
  const shownView = getShownShoppingView(pick, activeQuery, matches);
  const switchOptions = SHOPPING_VIEWS.map((value) => ({
    value,
    label: `${SHOPPING_VIEW_LABELS[value]} · ${counts[value]}`,
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
        cleared.length < gotItemCount
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
    const hasPantryChip = !isSearching && putAwayRows.length > 0;
    const clearButton = !isSearching && gotCount > 0 && (
      <ActionChips
        actions={[
          ...(hasPantryChip
            ? [
                {
                  key: 'to-pantry',
                  icon: <PackageIcon className='h-4 w-4' />,
                  label: 'Add to pantry',
                  isDisabled: !isPantryReady,
                  onClick: () =>
                    setOverlay({ kind: 'pantry', rows: putAwayRows }),
                },
              ]
            : []),
          {
            key: 'clear-got',
            icon: <BrushCleaning className='h-4 w-4' />,
            label: 'Clear what you got',
            isLoading: isClearing,
            onClick: () => void handleClear(),
          },
        ]}
      />
    );
    const renderHalf = (half: ShoppingHalf) =>
      matches[half] < SHOP_SECTION_DIVIDER_MIN_ROWS ? (
        <ShoppingRows
          key={`${shownView}-${half}`}
          rows={found[half].flatMap((group) => group.rows)}
          getForText={getForText}
          onToggle={handleToggle}
          onOpen={handleOpen}
          className='lg:w-[calc(50%-1rem)]'
        />
      ) : (
        <div className='space-y-4 lg:block lg:columns-2 lg:space-y-0 lg:gap-x-8'>
          {found[half].map((group, index) => (
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
      );

    if (shownView === 'all') {
      if (counts.all === 0) {
        return getEmpty();
      }
      return (
        <>
          {matches.toBuy > 0
            ? renderHalf('toBuy')
            : !isSearching && (
                <p className='text-muted-foreground text-sm'>
                  Nothing left to buy.
                </p>
              )}
          {matches.got > 0 && (
            <section aria-label='Got it' className='space-y-1'>
              <SectionDivider
                label='Got it'
                trailing={hasPantryChip ? undefined : clearButton}
              />
              {hasPantryChip && (
                <div className='flex justify-end'>{clearButton}</div>
              )}
              <ShoppingRows
                key='all-got'
                rows={found.got.flatMap((group) => group.rows)}
                isEager={matches.toBuy < SHOP_SECTION_DIVIDER_MIN_ROWS}
                getForText={getForText}
                onToggle={handleToggle}
                onOpen={handleOpen}
                className='lg:w-[calc(50%-1rem)]'
              />
            </section>
          )}
        </>
      );
    }

    return (
      <>
        {shownView === 'got' && clearButton && (
          <div className='flex justify-end'>{clearButton}</div>
        )}
        {matches[shownView] === 0 ? getEmpty() : renderHalf(shownView)}
      </>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Shopping'
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
      {hasSearch && loadError === null && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder='Search your list'
        />
      )}
      {loadError === null &&
        isLoaded &&
        meals.length > 0 &&
        activeQuery === '' && (
          <nav aria-label='Also in Shopping' className='grid grid-cols-2 gap-3'>
            <EntryTile
              icon={<UtensilsCrossed className='size-4' />}
              label='Meals on your list'
              status={`For ${getShoppingMealsText(meals, todayKey)}`}
              onClick={() => setOverlay({ kind: 'meals' })}
            />
          </nav>
        )}
      {openCount > 0 &&
        shownView !== 'got' &&
        (coverage === 'some' || coverage === 'all') && (
          <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            <span>
              About{' '}
              <span className='text-foreground font-semibold'>
                {formatCost(cost.totalCents ?? 0)}
              </span>{' '}
              {getCoveredText()}
            </span>
            <HelpTip
              variant={cost.leftOut.length > 0 ? 'warning' : 'help'}
              title='About this price'
              placement='top'
              dismissLabel='OK'
            >
              <p>
                It prices the amounts on your list, not whole packages, so the
                till total is usually more.
              </p>
              {noProductNames.length > 0 && (
                <p>
                  Not priced yet: {formatNames(noProductNames)}. Prices come
                  from what you've told Pinch about where you buy things.
                </p>
              )}
              {notComparableNames.length > 0 && (
                <p className='text-muted-foreground'>
                  Can't compare the amount with the package size:{' '}
                  {formatNames(notComparableNames)}. Change the package size
                  from the ingredient in Kitchen.
                </p>
              )}
            </HelpTip>
          </p>
        )}
      {getBody()}
      {overlay?.kind === 'add' && (
        <ShoppingAddSheet uid={uid} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'meals' && (
        <ShoppingMealsSheet
          uid={uid}
          todayKey={todayKey}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'pantry' && (
        <PantryFromShoppingSheet
          uid={uid}
          rows={overlay.rows}
          onAdded={markPutAway}
          onClose={() => setOverlay(null)}
        />
      )}
      {openRow && openItems.length > 0 && (
        <ShoppingItemSheet
          key={openRow.id}
          uid={uid}
          name={openRow.name}
          todayKey={todayKey}
          items={openItems}
          onClose={() => setOverlay(null)}
          onRemove={() => handleRemove(openRow.name, openItems)}
        />
      )}
    </div>
  );
}

export default memo(ShoppingScreen);
