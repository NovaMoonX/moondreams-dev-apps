import { useAppSelector } from '@/store';
import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import { PillGroup } from '@/components/PillGroup';
import { useNow } from '@/hooks/useNow';
import InquiryDrawer from '@apps/going-once/components/inbox/InquiryDrawer';
import InquiryRow from '@apps/going-once/components/inbox/InquiryRow';
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
} from '@apps/going-once/store/selectors';
import type { InboxView } from '@apps/going-once/types';
import { describeInquiryThing } from '@apps/going-once/utils/inquiries';

const ROW_HEIGHT = 76;
const EAGER_ROWS = 10;

const EMPTY_TEXT: Record<InboxView, string> = {
  new: 'No one has asked yet. Share the public link to get things moving.',
  handled: "Nothing handled yet. Messages you've answered land here.",
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
}

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
        <EmptyCard icon={view === 'new' ? '📬' : '✅'}>
          {EMPTY_TEXT[view]}
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
          thing={describe(open)}
          handledBy={getHandledBy(open)}
          now={now}
          onClose={onClose}
          onBackToNew={() => onSwitchView('new')}
        />
      )}
    </div>
  );
}

export default InboxTab;
