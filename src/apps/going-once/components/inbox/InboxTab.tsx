import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import { useNow } from '@/hooks/useNow';
import InquiryDrawer from '@apps/going-once/components/inbox/InquiryDrawer';
import InquiryRow from '@apps/going-once/components/inbox/InquiryRow';
import PushCapsule from '@apps/going-once/components/inbox/PushCapsule';
import OpenThing from '@apps/going-once/components/things/OpenThing';
import {
  HANDLED_INBOX_LIMIT,
  INBOX_VIEWS,
  INBOX_VIEW_LABELS,
} from '@apps/going-once/constants';
import { usePersonNames } from '@apps/going-once/hooks/usePersonNames';
import {
  selectHandledInquiries,
  selectInquiriesStatus,
  selectItems,
  selectItemsStatus,
  selectNewInquiries,
  selectSaleById,
  selectStatusSummary,
} from '@apps/going-once/store/selectors';
import type { InboxView } from '@apps/going-once/types';
import { describeInquiryThing } from '@apps/going-once/utils/inquiries';
import { isSaleSeller } from '@apps/going-once/utils/roles';

const ROW_HEIGHT = 76;
const EAGER_ROWS = 10;

const EMPTY_TEXT: Record<InboxView, string> = {
  new: 'No one has asked yet. Share the public link to get things moving.',
  handled: "Nothing handled yet. Messages you've answered land here.",
};

const PAGE_OFF_TEXT = {
  seller: 'Turn on the public page in Sale to let buyers ask.',
  coSeller:
    "The public page is off, so buyers can't ask yet. Only the seller can turn it on.",
};

interface InboxTabProps {
  saleId: string;
  uid: string;
  view: InboxView;
  onViewChange: (view: InboxView) => void;
  /** Changes the view and leaves the open message where it is. */
  onSwitchView: (view: InboxView) => void;
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** The thing whose drawer is open over the message, kept in the address. */
  openThingId: string | null;
  onOpenThing: (id: string) => void;
  onCloseThing: () => void;
  /** Opens the Things tab with this thing's add-a-thing walk-through. */
  onFinishThing: (id: string) => void;
  /** Goes to the Sale tab, where the public page is switched on. */
  onOpenSale: () => void;
}

const getEmptyText = (
  view: InboxView,
  isPageOff: boolean,
  isSeller: boolean,
) => {
  if (view !== 'new' || !isPageOff) return EMPTY_TEXT[view];
  return isSeller ? PAGE_OFF_TEXT.seller : PAGE_OFF_TEXT.coSeller;
};

/** The Inbox tab: the messages buyers sent about the sale's things, New first and the newest Handled ones behind a thin switch. */
function InboxTab({
  saleId,
  uid,
  view,
  onViewChange,
  onSwitchView,
  openId,
  onOpen,
  onClose,
  openThingId,
  onOpenThing,
  onCloseThing,
  onFinishThing,
  onOpenSale,
}: InboxTabProps) {
  const now = useNow();
  const fresh = useAppSelector((state) => selectNewInquiries(state, saleId));
  const handled = useAppSelector((state) =>
    selectHandledInquiries(state, saleId),
  );
  const status = useAppSelector((state) =>
    selectInquiriesStatus(state, saleId),
  );
  const items = useAppSelector((state) => selectItems(state, saleId));
  const sale = useAppSelector((state) => selectSaleById(state, saleId));
  const summary = useAppSelector((state) => selectStatusSummary(state, saleId));
  const itemsStatus = useAppSelector(selectItemsStatus);
  const getName = usePersonNames(
    handled.flatMap((inquiry) =>
      inquiry.handledBy === null ? [] : [inquiry.handledBy],
    ),
    uid,
  );
  const shown = view === 'new' ? fresh : handled;
  const open = [...fresh, ...handled].find((inquiry) => inquiry.id === openId);
  const areItemsKnown = itemsStatus === 'ready';
  const describe = (inquiry: (typeof shown)[number]) =>
    describeInquiryThing(inquiry, items, areItemsKnown);
  const getHandledBy = (inquiry: (typeof shown)[number]) =>
    inquiry.status === 'HANDLED' && inquiry.handledBy !== null
      ? getName(inquiry.handledBy)
      : null;
  const isLastSeen = handled.length >= HANDLED_INBOX_LIMIT;
  const findItem = (inquiry: (typeof shown)[number]) =>
    items.find((candidate) => candidate.id === inquiry.itemId) ?? null;
  const openThing = items.find((candidate) => candidate.id === openThingId);
  const isPageOff = sale !== null && sale.publicLinkId === null;
  const isSeller = sale !== null && isSaleSeller(sale, uid);

  if (status === 'error') {
    return (
      <EmptyCard icon='⚠️'>
        We couldn&apos;t load this sale&apos;s messages. Check your connection
        and refresh the page.
      </EmptyCard>
    );
  }

  return (
    <div className='space-y-4'>
      <PushCapsule saleId={saleId} uid={uid} />
      {openId !== null && open === undefined && status === 'ready' && (
        <p className='text-muted-foreground text-sm'>
          That message isn&apos;t here anymore.
        </p>
      )}
      <PillGroup
        label='Inbox'
        isThin
        options={INBOX_VIEWS.map((value) => ({
          value,
          label: INBOX_VIEW_LABELS[value],
          detail:
            status !== 'ready' || (value === 'handled' && isLastSeen)
              ? undefined
              : String(value === 'new' ? fresh.length : handled.length),
        }))}
        value={view}
        onChange={onViewChange}
      />
      {status === 'ready' && shown.length === 0 && (
        <EmptyCard
          icon={view === 'new' ? '📬' : '✅'}
          action={
            view === 'new' && isPageOff && isSeller ? (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                rounded='full'
                className='h-10'
                onClick={onOpenSale}
              >
                Go to Sale
              </Button>
            ) : undefined
          }
        >
          {getEmptyText(view, isPageOff, isSeller)}
        </EmptyCard>
      )}
      {shown.length > 0 && (
        <ul className='space-y-2'>
          {shown.map((inquiry, index) => (
            <li key={inquiry.id}>
              <LazyMount
                estimatedHeight={ROW_HEIGHT}
                eager={index < EAGER_ROWS}
              >
                <InquiryRow
                  inquiry={inquiry}
                  item={findItem(inquiry)}
                  thing={describe(inquiry)}
                  handledBy={getHandledBy(inquiry)}
                  now={now}
                  onOpen={() => onOpen(inquiry.id)}
                />
              </LazyMount>
            </li>
          ))}
        </ul>
      )}
      {view === 'handled' && isLastSeen && (
        <p className='text-muted-foreground text-center text-sm'>
          Showing the {HANDLED_INBOX_LIMIT} most recent.
        </p>
      )}
      {open !== undefined && (
        <InquiryDrawer
          key={open.id}
          inquiry={open}
          uid={uid}
          item={findItem(open)}
          onOpenThing={() => onOpenThing(open.itemId)}
          thing={describe(open)}
          handledBy={getHandledBy(open)}
          now={now}
          onClose={onClose}
          onBackToNew={() => onSwitchView('new')}
        />
      )}
      {open !== undefined && openThing !== undefined && (
        <OpenThing
          key={openThing.id}
          item={openThing}
          uid={uid}
          isSeller={isSeller}
          sold={summary.SOLD}
          onClose={onCloseThing}
          onFinish={() => onFinishThing(openThing.id)}
        />
      )}
    </div>
  );
}

export default InboxTab;
