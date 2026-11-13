import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, FolderDown, Plus, X } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import SortControl from '@/components/SortControl';
import { useBackStep } from '@/hooks/useBackHistory';
import { useSelection } from '@/hooks/useSelection';
import { commitDeferred, useHiddenDeferredKeys } from '@/lib/undo/deferredUndo';
import { useAppDispatch, useAppSelector } from '@/store';
import BundleFormSheet from '@apps/going-once/components/bundles/BundleFormSheet';
import BundleRow from '@apps/going-once/components/bundles/BundleRow';
import BundleSheet from '@apps/going-once/components/bundles/BundleSheet';
import SaveAllPhotosSheet from '@apps/going-once/components/relist/SaveAllPhotosSheet';
import NewThingFlow from '@apps/going-once/components/things/NewThingFlow';
import OpenThing from '@apps/going-once/components/things/OpenThing';
import ThingRow from '@apps/going-once/components/things/ThingRow';
import {
  MAX_BUNDLE_THINGS,
  MIN_BUNDLE_THINGS,
  ITEM_SORT_OPTIONS,
  DID_NOT_SELL_LABEL,
  SEARCH_FROM_ITEMS,
  STATUS_LABELS,
  STATUS_VIEWS,
} from '@apps/going-once/constants';
import { retryLoading } from '@apps/going-once/store';
import {
  selectBundles,
  selectItemsById,
  selectItems,
  selectIsSaleFinished,
  selectIsBundlesReady,
  selectItemsStatus,
  selectPhotoUploads,
  selectSaleById,
} from '@apps/going-once/store/selectors';
import type { Bundle, BundleStatus, Item } from '@apps/going-once/types';
import { toUnbundleKey } from '@apps/going-once/utils/bundles';
import { isSaleSeller } from '@apps/going-once/utils/roles';
import {
  isListable,
  matchesSearch,
  sortItems,
  type ItemSort,
} from '@apps/going-once/utils/listing';
import type { StatusView } from '@apps/going-once/utils/status';
import {
  formatStatusTotal,
  getStatusSummary,
} from '@apps/going-once/utils/statusSummary';

const BUNDLE_STATUS_BY_VIEW: Record<StatusView, BundleStatus> = {
  AVAILABLE: 'ACTIVE',
  PENDING: 'PENDING',
  SOLD: 'SOLD',
};

const matchesBundleSearch = (
  bundle: Bundle,
  query: string,
  itemsById: Record<string, Item>,
) => {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    bundle.name.toLowerCase().includes(needle) ||
    bundle.itemIds.some((id) => {
      const item = itemsById[id];
      return item !== undefined && matchesSearch(item, needle);
    })
  );
};

const ROW_HEIGHT = 72;
const EAGER_ROWS = 10;
const BUNDLES_FIRST = 3;

const EMPTY_VIEW_TEXT: Record<StatusView, string> = {
  AVAILABLE: 'Nothing is available right now.',
  PENDING:
    'Nothing is pending. A thing lands here when someone is set to pick it up.',
  SOLD: 'Nothing has sold yet. What you sell, and what was paid, shows up here.',
};

interface ItemsSectionProps {
  saleId: string;
  uid: string;
  /** The thing whose drawer is open, kept in the address. */
  openId: string | null;
  onOpenThing: (id: string) => void;
  onCloseThing: () => void;
  /** The bundle whose sheet is open, kept in the address. */
  openBundleId: string | null;
  onOpenBundle: (id: string) => void;
  onCloseBundle: () => void;
  /** The status the list is switched to, kept in the address so the Sale tab's tiles can open it. */
  statusView: StatusView;
  onStatusViewChange: (view: StatusView) => void;
  /** A thing whose add-a-thing walk-through opens as the tab mounts, when another tab sent the person here to finish it. */
  resumeId: string | null;
  onResumeTaken: () => void;
}

/** The Things tab: the sale's things, newest first, with a search and a sort once there are enough to need them, and the way to add one. */
function ItemsSection({
  saleId,
  uid,
  openId,
  onOpenThing,
  onCloseThing,
  openBundleId,
  onOpenBundle,
  onCloseBundle,
  statusView,
  onStatusViewChange,
  resumeId,
  onResumeTaken,
}: ItemsSectionProps) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => selectItems(state, saleId));
  const status = useAppSelector(selectItemsStatus);
  const uploads = useAppSelector(selectPhotoUploads);
  const sale = useAppSelector((state) => selectSaleById(state, saleId));
  const [adding, setAdding] = useState<{ resume: Item | null } | null>(() => {
    const resume = items.find((item) => item.id === resumeId);
    return resume === undefined ? null : { resume };
  });
  const storedBundles = useAppSelector((state) => selectBundles(state, saleId));
  const hiddenKeys = useHiddenDeferredKeys();
  const isUnbundling = (bundleId: string) =>
    hiddenKeys.has(toUnbundleKey(bundleId));
  const bundles = storedBundles.filter((bundle) => !isUnbundling(bundle.id));
  const itemsById = useAppSelector((state) => selectItemsById(state, saleId));
  const isBundlesReady = useAppSelector((state) =>
    selectIsBundlesReady(state, saleId),
  );
  const selection = useSelection();
  const [isMakingBundle, setIsMakingBundle] = useState(false);
  const [isAllBundles, setIsAllBundles] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ItemSort>('newest');
  const [isUnlistedOnly, setIsUnlistedOnly] = useState(false);
  const [isSavingPhotos, setIsSavingPhotos] = useState(false);
  const openItem = items.find((item) => item.id === openId) ?? null;
  const openBundle =
    bundles.find((bundle) => bundle.id === openBundleId) ?? null;
  const getBundleName = (item: Item) =>
    bundles.find((bundle) => bundle.id === item.bundleId)?.name ?? null;
  const isSeller = isSaleSeller(sale, uid);
  const isFinished = useAppSelector((state) =>
    selectIsSaleFinished(state, saleId),
  );
  const getEmptyText = (value: StatusView) =>
    value === 'AVAILABLE' && isFinished
      ? 'Nothing is left over.'
      : EMPTY_VIEW_TEXT[value];
  const getStatusLabel = (value: StatusView) =>
    value === 'AVAILABLE' && isFinished
      ? DID_NOT_SELL_LABEL
      : STATUS_LABELS[value];

  const hasTools = items.length >= SEARCH_FROM_ITEMS;
  const searched = items.filter(
    (item) => !hasTools || matchesSearch(item, query),
  );
  const isSearching = hasTools && query.trim() !== '';
  const summary = getStatusSummary(searched);
  const totals = getStatusSummary(items);
  const inView = searched.filter((item) => item.status === statusView);
  const unlistedCount =
    statusView === 'AVAILABLE'
      ? inView.filter((item) => !isListable(item)).length
      : 0;
  const isNarrowed = isUnlistedOnly && unlistedCount > 0;
  const order = hasTools ? sort : 'newest';
  const shown = sortItems(
    inView.filter((item) =>
      isNarrowed ? !isListable(item) : unlistedCount === 0 || isListable(item),
    ),
    order,
  );
  const allTakenOff = searched.filter((item) => item.status === 'WITHDRAWN');
  const takenOff = statusView === 'SOLD' ? sortItems(allTakenOff, order) : [];
  const bundlesInView = bundles
    .filter(
      (bundle) =>
        bundle.status === BUNDLE_STATUS_BY_VIEW[statusView] &&
        (!hasTools || matchesBundleSearch(bundle, query, itemsById)),
    )
    .sort((first, second) => second.createdAt - first.createdAt);
  const isBundlesCapped =
    !isAllBundles &&
    query.trim() === '' &&
    bundlesInView.length > BUNDLES_FIRST;
  const bundlesShown = isBundlesCapped
    ? bundlesInView.slice(0, BUNDLES_FIRST)
    : bundlesInView;
  const isPickable = (item: Item) =>
    item.status === 'AVAILABLE' &&
    isListable(item) &&
    (item.bundleId === null || isUnbundling(item.bundleId));
  const pickedIds = items
    .filter((item) => isPickable(item) && selection.ids.has(item.id))
    .map((item) => item.id);
  const isPicking = selection.isActive && statusView === 'AVAILABLE';
  const canGroup =
    pickedIds.length >= MIN_BUNDLE_THINGS &&
    pickedIds.length <= MAX_BUNDLE_THINGS;
  // A picked thing freed by an Unbundle still waiting on its Undo is still bundled on the server, so that write goes first.
  const startBundle = async () => {
    const waiting = [
      ...new Set(
        pickedIds.flatMap((id) => {
          const bundleId = itemsById[id]?.bundleId ?? null;
          return bundleId === null ? [] : [toUnbundleKey(bundleId)];
        }),
      ),
    ];
    await Promise.all(waiting.map(commitDeferred));
    setIsMakingBundle(true);
  };
  const takenOffRef = useRef<HTMLDivElement | null>(null);

  const showTakenOff = () => {
    onStatusViewChange('SOLD');
    window.requestAnimationFrame(() =>
      takenOffRef.current?.scrollIntoView({ block: 'start' }),
    );
  };

  useBackStep(selection.isActive, selection.exit);

  const changeView = (view: StatusView) => {
    selection.exit();
    onStatusViewChange(view);
  };

  // A link to a bundle that is gone (unbundled, or from another sale) opens nothing, so the address drops it.
  useEffect(() => {
    if (openBundleId !== null && openBundle === null && isBundlesReady)
      onCloseBundle();
  }, [openBundleId, openBundle, isBundlesReady, onCloseBundle]);

  // A link to a thing that is gone (deleted, or from another sale) opens nothing, so the address drops it.
  useEffect(() => {
    if (
      openId !== null &&
      openItem === null &&
      status === 'ready' &&
      items.length > 0
    )
      onCloseThing();
  }, [openId, openItem, status, items.length, onCloseThing]);

  const renderRow = (item: Item, index: number) => (
    <li key={item.id}>
      <LazyMount estimatedHeight={ROW_HEIGHT} eager={index < EAGER_ROWS}>
        <ThingRow
          item={item}
          uploadingCount={uploads[item.id] ?? 0}
          onOpen={() => onOpenThing(item.id)}
          bundleName={getBundleName(item)}
          onLongPress={
            !isFinished && !isPicking && isPickable(item)
              ? () => {
                  selection.start();
                  selection.toggle([item.id]);
                }
              : undefined
          }
          pick={
            isPicking
              ? {
                  isPickable: isPickable(item),
                  isChecked: selection.ids.has(item.id),
                  onToggle: () => selection.toggle([item.id]),
                }
              : undefined
          }
        />
      </LazyMount>
    </li>
  );

  const addButton = (
    <Button
      size='sm'
      rounded='full'
      onClick={() => setAdding({ resume: null })}
    >
      <Plus className='size-4' aria-hidden='true' />
      New thing
    </Button>
  );

  const hasSavablePhotos = items.some(
    (item) =>
      (item.status === 'AVAILABLE' || item.status === 'PENDING') &&
      item.photos.length > 0,
  );

  const headerActions = (
    <div className='flex items-center gap-2'>
      {hasSavablePhotos && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          aria-label='Save all photos'
          className="relative size-7 min-w-7 p-0 before:absolute before:-inset-1.5 before:-inset-x-1.5! before:content-['']"
          onClick={() => setIsSavingPhotos(true)}
        >
          <FolderDown className='size-4' aria-hidden='true' />
        </Button>
      )}
      {!isFinished && addButton}
    </div>
  );

  if (status === 'error') {
    return (
      <EmptyCard
        icon='⚠️'
        action={
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className='h-10'
            onClick={() => dispatch(retryLoading())}
          >
            Try again
          </Button>
        }
      >
        We couldn&apos;t load this sale&apos;s things. Check your connection and
        try again.
      </EmptyCard>
    );
  }

  return (
    <div className='space-y-4'>
      <SectionHeader title='Things' action={headerActions} />
      {items.length === 0 && status === 'ready' && (
        <EmptyCard icon='🏷️'>
          Add your first thing: photos first, then a name and a price.
        </EmptyCard>
      )}
      {hasTools && (
        <div className='flex items-center gap-2'>
          <SearchInput
            className='min-w-0 flex-1'
            value={query}
            onChange={setQuery}
            placeholder='Search your things'
          />
          <SortControl
            label='Sort things'
            options={ITEM_SORT_OPTIONS}
            value={sort}
            defaultValue='newest'
            onChange={setSort}
          />
        </div>
      )}
      {items.length > 0 && (
        <PillGroup
          label='Status'
          isThin
          wrapsNarrow
          options={STATUS_VIEWS.map((value) => ({
            value,
            label: getStatusLabel(value),
            detail: String(summary[value].count),
          }))}
          value={statusView}
          onChange={changeView}
        />
      )}
      {unlistedCount > 0 &&
        (isNarrowed ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            aria-label='Show all things again'
            onClick={() => setIsUnlistedOnly(false)}
          >
            Drafts · {unlistedCount}
            <X className='size-4' aria-hidden='true' />
          </Button>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            className='border-border text-foreground! h-10 w-full justify-between rounded-full border px-4 text-sm'
            onClick={() => setIsUnlistedOnly(true)}
          >
            {unlistedCount} {unlistedCount === 1 ? 'draft' : 'drafts'}
            <ChevronRight className='size-4' aria-hidden='true' />
          </Button>
        ))}
      {searched.length === 0 && items.length > 0 && (
        <p className='text-muted-foreground text-center text-sm'>
          Nothing matches that. Try another word.
        </p>
      )}
      {searched.length > 0 &&
        shown.length === 0 &&
        bundlesInView.length === 0 && (
          <p className='text-muted-foreground text-center text-sm'>
            {isSearching
              ? `No matches in ${getStatusLabel(statusView)}`
              : getEmptyText(statusView)}
          </p>
        )}
      {bundlesInView.length > 0 && !isPicking && (
        <>
          <SectionDivider label={`Bundles · ${bundlesInView.length}`} />
          <ul className='space-y-2'>
            {bundlesShown.map((bundle, index) => (
              <li key={bundle.id}>
                <LazyMount
                  estimatedHeight={ROW_HEIGHT}
                  eager={index < EAGER_ROWS}
                >
                  <BundleRow
                    bundle={bundle}
                    itemsById={itemsById}
                    onOpen={() => onOpenBundle(bundle.id)}
                  />
                </LazyMount>
              </li>
            ))}
          </ul>
          {isBundlesCapped && (
            <Button
              type='button'
              variant='tertiary'
              className='text-primary h-11 w-full rounded-full text-sm'
              onClick={() => setIsAllBundles(true)}
            >
              Show all {bundlesInView.length} bundles
            </Button>
          )}
          {shown.length > 0 && <SectionDivider label='Things' />}
        </>
      )}
      {shown.length > 0 && (
        <ul className='space-y-2'>
          {shown.map((item, index) => renderRow(item, index))}
        </ul>
      )}
      {shown.length > 0 && !isNarrowed && (
        <p className='text-muted-foreground text-right text-sm'>
          {isSearching && `All ${getStatusLabel(statusView).toLowerCase()} · `}
          {formatStatusTotal(statusView, totals)}
        </p>
      )}
      {statusView === 'AVAILABLE' && allTakenOff.length > 0 && (
        <Button
          type='button'
          variant='tertiary'
          className='border-border text-foreground! h-10 w-full justify-between rounded-full border px-4 text-sm'
          onClick={showTakenOff}
        >
          {allTakenOff.length} taken off the list
          <ChevronRight className='size-4' aria-hidden='true' />
        </Button>
      )}
      {takenOff.length > 0 && (
        <>
          <div ref={takenOffRef} className='scroll-mt-4'>
            <SectionDivider label={`Taken off the list · ${takenOff.length}`} />
          </div>
          <ul className='space-y-2'>
            {takenOff.map((item, index) =>
              renderRow(item, shown.length + index),
            )}
          </ul>
        </>
      )}
      {openItem && (
        <OpenThing
          key={openItem.id}
          item={openItem}
          uid={uid}
          isSeller={isSeller}
          sold={totals.SOLD}
          onClose={onCloseThing}
          onOpenBundle={(id) => {
            onCloseThing();
            onOpenBundle(id);
          }}
          onFinish={() => {
            setAdding({ resume: openItem });
            onCloseThing();
          }}
        />
      )}
      {openBundle && (
        <BundleSheet
          key={openBundle.id}
          bundle={openBundle}
          uid={uid}
          onClose={onCloseBundle}
          onOpenThing={(id) => {
            onCloseBundle();
            onOpenThing(id);
          }}
        />
      )}
      {isPicking && (
        <SelectionBar
          note={
            pickedIds.length === 0
              ? `Pick ${MIN_BUNDLE_THINGS} or more things`
              : `${pickedIds.length} picked`
          }
          actions={[
            { key: 'cancel', label: 'Cancel', onClick: selection.exit },
          ]}
          primary={{
            key: 'group',
            label: 'Group into a bundle',
            shortLabel: 'Group into a bundle',
            isDisabled: !canGroup,
            onClick: () => void startBundle(),
          }}
        />
      )}
      {isMakingBundle && (
        <BundleFormSheet
          saleId={saleId}
          uid={uid}
          bundle={null}
          startItemIds={pickedIds}
          onClose={() => setIsMakingBundle(false)}
          onSaved={() => {
            setIsMakingBundle(false);
            selection.exit();
          }}
        />
      )}
      {isSavingPhotos && (
        <SaveAllPhotosSheet
          saleId={saleId}
          onClose={() => setIsSavingPhotos(false)}
        />
      )}
      {adding && (
        <NewThingFlow
          saleId={saleId}
          uid={uid}
          resume={adding.resume}
          onClose={() => {
            setAdding(null);
            onResumeTaken();
          }}
        />
      )}
    </div>
  );
}

export default ItemsSection;
