import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus, X } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SortControl from '@/components/SortControl';
import { useAppSelector } from '@/store';
import NewThingFlow from '@apps/going-once/components/things/NewThingFlow';
import ThingDrawer from '@apps/going-once/components/things/ThingDrawer';
import ThingForm from '@apps/going-once/components/things/ThingForm';
import ThingRow from '@apps/going-once/components/things/ThingRow';
import {
  ITEM_SORT_OPTIONS,
  SEARCH_FROM_ITEMS,
  STATUS_LABELS,
  STATUS_VIEWS,
} from '@apps/going-once/constants';
import {
  selectItems,
  selectItemsStatus,
  selectPhotoUploads,
  selectSaleById,
} from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';
import { keepEntryFor } from '@/hooks/useBackHistory';
import {
  isListable,
  matchesSearch,
  sortItems,
  type ItemSort,
} from '@apps/going-once/utils/listing';
import {
  formatStatusTotal,
  getStatusSummary,
  type StatusView,
} from '@apps/going-once/utils/status';

const ROW_HEIGHT = 72;
const EAGER_ROWS = 10;

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
}

/** The Things tab: the sale's things, newest first, with a search and a sort once there are enough to need them, and the way to add one. */
function ItemsSection({
  saleId,
  uid,
  openId,
  onOpenThing,
  onCloseThing,
}: ItemsSectionProps) {
  const items = useAppSelector((state) => selectItems(state, saleId));
  const status = useAppSelector(selectItemsStatus);
  const uploads = useAppSelector(selectPhotoUploads);
  const sale = useAppSelector((state) => selectSaleById(state, saleId));
  const [adding, setAdding] = useState<{ resume: Item | null } | null>(null);
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ItemSort>('newest');
  const [isUnlistedOnly, setIsUnlistedOnly] = useState(false);
  const [statusView, setStatusView] = useState<StatusView>('AVAILABLE');
  const openItem = items.find((item) => item.id === openId) ?? null;
  const isModifying = openItem !== null && modifyId === openItem.id;
  const isSeller = sale?.ownerUid === uid;

  const hasTools = items.length >= SEARCH_FROM_ITEMS;
  const searched = items.filter(
    (item) => !hasTools || matchesSearch(item, query),
  );
  const summary = getStatusSummary(searched);
  const soldFigures = getStatusSummary(items).SOLD;
  const inView = searched.filter((item) => item.status === statusView);
  const unlistedCount =
    statusView === 'AVAILABLE'
      ? inView.filter((item) => !isListable(item)).length
      : 0;
  const isNarrowed = isUnlistedOnly && unlistedCount > 0;
  const order = hasTools ? sort : 'newest';
  const shown = sortItems(
    inView.filter((item) => !isNarrowed || !isListable(item)),
    order,
  );
  const takenOff =
    statusView === 'SOLD'
      ? sortItems(
          searched.filter((item) => item.status === 'WITHDRAWN'),
          order,
        )
      : [];

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

  if (status === 'error') {
    return (
      <EmptyCard icon='⚠️'>
        We couldn&apos;t load this sale&apos;s things. Check your connection and
        refresh the page.
      </EmptyCard>
    );
  }

  return (
    <div className='space-y-4'>
      <SectionHeader title='Things' action={addButton} />
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
            label: STATUS_LABELS[value],
            detail: String(summary[value].count),
          }))}
          value={statusView}
          onChange={setStatusView}
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
            Not listed yet · {unlistedCount}
            <X className='size-4' aria-hidden='true' />
          </Button>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            className='border-border text-foreground! h-10 w-full justify-between rounded-full border px-4 text-sm'
            onClick={() => setIsUnlistedOnly(true)}
          >
            {unlistedCount} not listed yet
            <ChevronRight className='size-4' aria-hidden='true' />
          </Button>
        ))}
      {searched.length === 0 && items.length > 0 && (
        <p className='text-muted-foreground text-center text-sm'>
          Nothing matches that. Try another word.
        </p>
      )}
      {searched.length > 0 && shown.length === 0 && takenOff.length === 0 && (
        <p className='text-muted-foreground text-center text-sm'>
          {EMPTY_VIEW_TEXT[statusView]}
        </p>
      )}
      {shown.length > 0 && (
        <ul className='space-y-2'>
          {shown.map((item, index) => renderRow(item, index))}
        </ul>
      )}
      {shown.length > 0 && !isNarrowed && (
        <p className='text-muted-foreground text-right text-sm'>
          {formatStatusTotal(statusView, summary)}
        </p>
      )}
      {takenOff.length > 0 && (
        <>
          <SectionDivider label={`Taken off the list · ${takenOff.length}`} />
          <ul className='space-y-2'>
            {takenOff.map((item, index) =>
              renderRow(item, shown.length + index),
            )}
          </ul>
        </>
      )}
      {openItem && !isModifying && (
        <ThingDrawer
          item={openItem}
          uid={uid}
          isSeller={isSeller}
          sold={soldFigures}
          onClose={onCloseThing}
          onFinish={() => {
            setAdding({ resume: openItem });
            onCloseThing();
          }}
          onModify={() => {
            keepEntryFor('thing');
            setModifyId(openItem.id);
          }}
        />
      )}
      {openItem && isModifying && (
        <ThingForm
          item={openItem}
          uid={uid}
          isSeller={isSeller}
          onClose={() => setModifyId(null)}
        />
      )}
      {adding && (
        <NewThingFlow
          saleId={saleId}
          uid={uid}
          resume={adding.resume}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

export default ItemsSection;
