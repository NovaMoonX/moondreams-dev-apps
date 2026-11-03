import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BadgeDollarSign,
  CalendarClock,
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  History,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
  ChevronDown,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import LockedButton from '@/components/LockedButton';
import PhotoStrip from '@/components/PhotoStrip';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { centsToInputValue, formatCentsShort } from '@/utils/moneyUtils';
import { parseHttpUrl } from '@/utils/urlUtils';
import ChangePaidView from '@apps/going-once/components/things/ChangePaidView';
import CopyListingTextRow from '@apps/going-once/components/relist/CopyListingTextRow';
import CopyThingLinkRow from '@apps/going-once/components/relist/CopyThingLinkRow';
import SavePhotosRow from '@apps/going-once/components/relist/SavePhotosRow';
import HistoryView from '@apps/going-once/components/things/HistoryView';
import MarkPendingView from '@apps/going-once/components/things/MarkPendingView';
import MarkSoldView from '@apps/going-once/components/things/MarkSoldView';
import ThingInquiryView from '@apps/going-once/components/things/ThingInquiryView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import SoldConfirmation from '@apps/going-once/components/things/SoldConfirmation';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { useDeleteThing } from '@apps/going-once/hooks/useDeleteThing';
import { useSingleFlight } from '@apps/going-once/hooks/useSingleFlight';
import { usePersonNames } from '@apps/going-once/hooks/usePersonNames';
import { useThingInquiries } from '@apps/going-once/hooks/useThingInquiries';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import {
  changeStatus,
  type StatusResult,
  type StatusTransition,
} from '@apps/going-once/store/actions/statusActions';
import {
  selectIsSaleFinished,
  selectSaleById,
} from '@apps/going-once/store/selectors';
import type { Inquiry, Item } from '@apps/going-once/types';
import {
  formatSentAt,
  getInquirerName,
  getOwnMessage,
  isHolder,
} from '@apps/going-once/utils/inquiries';
import {
  canDeleteItem,
  formatAddedAgo,
  getItemName,
  getAvailableLabel,
  isListable,
} from '@apps/going-once/utils/listing';
import {
  getStatusFacts,
  getThingOffer,
  isUnderFloor,
} from '@apps/going-once/utils/status';
import {
  getHoldDraft,
  getHoldStart,
  getSoldDraft,
  isDraftChanged,
  type HoldDraft,
  type SoldDraft,
} from '@apps/going-once/utils/statusDrafts';
import type { StatusFigures } from '@apps/going-once/utils/statusSummary';

interface ThingDrawerProps {
  item: Item;
  uid: string;
  isSeller: boolean;
  onClose: () => void;
  /** Reopens the add-a-thing walk-through on this thing. */
  onFinish: () => void;
  onModify: () => void;
  /** Every sold thing in the sale, for Collected. */
  sold: StatusFigures;
  /** Opens straight on Mark pending, held for this person. */
  holdFor: Inquiry | null;
}

type View =
  | 'more'
  | 'markPending'
  | 'changeHold'
  | 'markSold'
  | 'sold'
  | 'changePaid'
  | 'history'
  | 'inquiry';

interface Row {
  label: string;
  value: string;
}

/** The store's page as a card that opens it; nothing for a link that isn't a web address. */
function StoreLink({ item }: { item: Item }) {
  const page = item.boughtUrl === null ? null : parseHttpUrl(item.boughtUrl);
  if (item.boughtUrl === null || page === null) return null;
  const { boughtUrlPreview: preview } = item;
  return (
    <a
      href={item.boughtUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='[&>div]:border-accent-foreground/20 [&>div]:bg-accent-foreground/5 block'
    >
      <LinkPreviewCard
        preview={{
          url: item.boughtUrl,
          host: page.hostname.replace(/^www\./i, ''),
          title: preview?.title ?? null,
          siteName: preview?.siteName ?? null,
          description: preview?.description ?? null,
          imageUrl: preview?.imageUrl?.startsWith('https://')
            ? preview.imageUrl
            : null,
        }}
      />
    </a>
  );
}

const INTEREST_SHOWN = 3;

const getPrivateRows = (item: Item): Row[] => {
  const bought = [
    item.boughtFrom,
    item.boughtOn === null ? null : formatDateUTC(item.boughtOn),
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return [
    ...(item.askingPriceCents === 0 || item.askingPriceCents === null
      ? []
      : [
          {
            label: 'Floor price',
            value:
              item.floorPriceCents === null
                ? 'None set'
                : formatCentsShort(item.floorPriceCents),
          },
        ]),
    ...(item.originalPriceCents === null || item.showOriginalPrice
      ? []
      : [
          {
            label: 'Original price',
            value: formatCentsShort(item.originalPriceCents),
          },
        ]),
    ...(bought === '' ? [] : [{ label: 'Where you got it', value: bought }]),
  ];
};

interface MoreAction {
  key: string;
  icon: ReactNode;
  label: string;
  subtitle: string;
  hasChevron?: boolean;
  onClick: () => void;
}

/** A thing in full: its photos, a facts line and the private figures sellers negotiate with, with its status acts one tap away. */
function ThingDrawer({
  item,
  uid,
  isSeller,
  onClose,
  onFinish,
  onModify,
  sold,
  holdFor,
}: ThingDrawerProps) {
  const [views, setViews] = useState<View[]>(() =>
    holdFor !== null &&
    getThingOffer(item.status, isListable(item)) === 'MARK_PENDING'
      ? ['markPending']
      : [],
  );
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { isWorking, run } = useSingleFlight();
  const now = useNow();
  const [holdStart, setHoldStart] = useState<HoldDraft>(() =>
    getHoldStart(holdFor, now),
  );
  const [hold, setHold] = useState<HoldDraft>(holdStart);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [isInterestExpanded, setIsInterestExpanded] = useState(false);
  const interestRef = useRef<HTMLElement>(null);
  const { inquiries, hasFailed: haveInquiriesFailed } = useThingInquiries(
    item.saleId,
    item.id,
  );
  const [soldDraft, setSoldDraft] = useState<SoldDraft>(() =>
    getSoldDraft(item, now),
  );
  const [paidAmount, setPaidAmount] = useState('');
  const { pending: undoable, showUndo, undo } = useUndoRemoval();
  const [undoLabel, setUndoLabel] = useState('Undo');
  const getName = usePersonNames(
    [item.sale?.markedBy, item.listingCopiedBy].filter(
      (person) => person != null,
    ),
    uid,
  );
  const name = getItemName(item);
  const view = views.at(-1) ?? null;
  const photos = useItemPhotoUrls(item.photos).flatMap((photo) =>
    photo.url === null ? [] : [{ id: photo.id, url: photo.url }],
  );
  const facts = [
    item.condition === null
      ? null
      : { key: 'condition', content: CONDITION_LABELS[item.condition] },
  ].filter((fact) => fact !== null);
  const buyerFacts = [
    item.brandModel === null
      ? null
      : { key: 'brand', content: item.brandModel },
    item.size === null ? null : { key: 'size', content: item.size },
    item.showOriginalPrice && item.originalPriceCents !== null
      ? {
          key: 'original',
          content: `Originally ${formatCentsShort(item.originalPriceCents)}`,
        }
      : null,
  ].filter((fact) => fact !== null);
  const privateRows = getPrivateRows(item);
  const hasPrivate =
    privateRows.length > 0 || item.boughtUrl !== null || item.notes !== null;
  const askedCount = new Set(
    (inquiries ?? []).map(
      (inquiry) =>
        `${(inquiry.name ?? '').trim().toLowerCase()}|${inquiry.phone ?? inquiry.email ?? inquiry.id}`,
    ),
  ).size;
  const canDelete = canDeleteItem(item, { isSeller, uid, now });
  const isSaleFinished = useAppSelector((state) =>
    selectIsSaleFinished(state, item.saleId),
  );
  const publicLinkId = useAppSelector(
    (state) => selectSaleById(state, item.saleId)?.publicLinkId ?? null,
  );
  const offer = getThingOffer(item.status, isListable(item), isSaleFinished);
  const isNotListed = item.status === 'AVAILABLE' && !isListable(item);
  const isOnTheList =
    item.status === 'PENDING' || (item.status === 'AVAILABLE' && !isNotListed);
  const isHoldLockedByFinish =
    isSaleFinished &&
    (item.status === 'PENDING' || (item.status === 'AVAILABLE' && isOnTheList));

  const getIsDirty = () => {
    if (view === 'markPending') return isDraftChanged(hold, holdStart);
    if (view === 'changeHold')
      return isDraftChanged(hold, getHoldDraft(item.pending, now));
    if (view === 'markSold')
      return isDraftChanged(soldDraft, getSoldDraft(item, now));
    if (view === 'changePaid')
      return paidAmount !== centsToInputValue(item.sale?.priceCents ?? 0);
    return false;
  };
  const isDirty = getIsDirty();

  const open = (next: View, holdFor: Inquiry | null = null) => {
    setStatusError(null);
    if (next === 'markPending') {
      const start = getHoldStart(holdFor, now);
      setHold(start);
      setHoldStart(start);
    }
    if (next === 'changeHold') setHold(getHoldDraft(item.pending, now));
    if (next === 'markSold') setSoldDraft(getSoldDraft(item, now));
    if (next === 'changePaid')
      setPaidAmount(centsToInputValue(item.sale?.priceCents ?? 0));
    setViews((current) => [...current, next]);
  };
  const back = () => setViews((current) => current.slice(0, -1));
  const toFront = () => setViews([]);
  const askBefore = {
    isDirty,
    title: 'Discard your changes?',
    message: 'They will not be saved.',
  };
  const goBack = useDiscardGuard({ ...askBefore, onClose: back });
  const closeDrawer = useDiscardGuard({ ...askBefore, onClose });

  const showRefusal = (result: StatusResult | null) => {
    if (result !== null && !result.ok) setStatusError(result.message);
  };

  /** One status act at a time: a second tap while it runs does nothing. Comes back to the thing once it has written; `null` when ignored. */
  const apply = (transition: StatusTransition) =>
    run(async () => {
      setStatusError(null);
      const result = await changeStatus(item.saleId, item.id, uid, transition);
      if (result.ok) toFront();
      return result;
    });
  const offerUndo = (
    message: string,
    label: string,
    restore: () => Promise<StatusResult | null>,
  ) => {
    setUndoLabel(label);
    showUndo(message, () => void restore().then(showRefusal));
  };

  const takeOffTheList = async () => {
    const restorePending = item.pending;
    const result = await apply({ kind: 'TAKE_OFF', undoesAt: null });
    showRefusal(result);
    if (result?.ok)
      offerUndo('Taken off the list', 'Put it back', () =>
        apply({ kind: 'PUT_BACK', restorePending, undoesAt: result.at }),
      );
  };
  const putBackOnTheList = async () => {
    const result = await apply({
      kind: 'PUT_BACK',
      restorePending: null,
      undoesAt: null,
    });
    showRefusal(result);
    if (result?.ok)
      offerUndo('Put back on the list', 'Undo', () =>
        apply({ kind: 'TAKE_OFF', undoesAt: result.at }),
      );
  };
  /** Takes the sale back and offers it again for a few seconds; answers a refusal in words. */
  const notSoldAfterAll = async (): Promise<string | null> => {
    const { sale } = item;
    if (sale === null) return null;
    const result = await apply({ kind: 'NOT_SOLD' });
    if (result === null || !result.ok) return result?.message ?? null;
    offerUndo('Back to available', 'Undo', () =>
      apply({ kind: 'RESTORE_SALE', sale, undoesAt: result.at }),
    );
    return null;
  };
  const backToAvailable = async () =>
    showRefusal(await apply({ kind: 'BACK_TO_AVAILABLE' }));

  const { deleteThing, dialog: deleteDialog } = useDeleteThing(
    item.saleId,
    uid,
    () => void takeOffTheList(),
  );
  const getTakeOffSubtitle = () => {
    const leaves = isSaleFinished
      ? 'Leaves the totals.'
      : 'Leaves the public page and the totals.';
    return item.status === 'PENDING'
      ? `Drops ${item.pending?.buyerName ? `${item.pending.buyerName}'s` : 'the'} hold. ${leaves}`
      : `Keeping it or gave it away. ${leaves}`;
  };
  const moreActions: MoreAction[] = [
    isOnTheList
      ? {
          key: 'markSold',
          icon: <BadgeDollarSign />,
          label: 'Mark sold',
          subtitle:
            item.status === 'PENDING'
              ? 'Record what they paid'
              : "Skip Pending, it's gone",
          hasChevron: true,
          onClick: () => open('markSold'),
        }
      : null,
    item.status === 'PENDING' && !isSaleFinished
      ? {
          key: 'changeHold',
          icon: <CalendarClock />,
          label: 'Change who or when',
          subtitle: 'Same hold, a new name or day',
          hasChevron: true,
          onClick: () => open('changeHold'),
        }
      : null,
    item.status === 'PENDING'
      ? {
          key: 'backToAvailable',
          icon: <Undo2 />,
          label: 'Back to available',
          subtitle: isSaleFinished
            ? "The pickup fell through. It goes back to Didn't sell."
            : 'The pickup fell through. Buyers see it as Available again.',
          onClick: () => void backToAvailable(),
        }
      : null,
    item.status === 'SOLD'
      ? {
          key: 'changePaid',
          icon: <Pencil />,
          label: 'Change what was paid',
          subtitle: 'Fix a typo; Collected follows',
          hasChevron: true,
          onClick: () => open('changePaid'),
        }
      : null,
    item.status === 'SOLD'
      ? {
          key: 'notSold',
          icon: <RotateCcw />,
          label: 'Not sold after all',
          subtitle: isSaleFinished
            ? "Back to Didn't sell, and out of Collected"
            : 'Back to Available, and out of Collected',
          onClick: () =>
            void notSoldAfterAll().then((message) => {
              if (message !== null) setStatusError(message);
            }),
        }
      : null,
    isOnTheList
      ? {
          key: 'takeOff',
          icon: <EyeOff />,
          label: 'Take off the list',
          subtitle: getTakeOffSubtitle(),
          onClick: () => void takeOffTheList(),
        }
      : null,
    item.status === 'WITHDRAWN'
      ? {
          key: 'putBack',
          icon: <Eye />,
          label: 'Put it back',
          subtitle: isSaleFinished
            ? "Back to Didn't sell"
            : 'Back on the public page as Available',
          onClick: () => void putBackOnTheList(),
        }
      : null,
    {
      key: 'history',
      icon: <History />,
      label: 'History',
      subtitle: 'Who changed what, and when',
      hasChevron: true,
      onClick: () => open('history'),
    },
  ].filter((action) => action !== null);

  const primary = () => {
    if (offer === null) return <span className='flex-1' aria-hidden='true' />;
    const actions: Record<NonNullable<typeof offer>, [string, () => void]> = {
      FINISH: ['Finish adding', onFinish],
      MARK_PENDING: ['Mark pending', () => open('markPending')],
      MARK_SOLD: ['Mark sold', () => open('markSold')],
      PUT_BACK: ['Put it back', () => void putBackOnTheList()],
    };
    const [label, onClick] = actions[offer];
    return (
      <Button
        type='button'
        size='lg'
        rounded='full'
        className='min-w-0 flex-1 whitespace-nowrap max-[359px]:px-4'
        disabled={isWorking}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  };

  const getMarkedBy = () => {
    if (item.sale === null) return 'someone';
    const marker = getName(item.sale.markedBy);
    return marker === 'You' ? 'you' : marker;
  };

  const asker = inquiries?.find((inquiry) => inquiry.id === inquiryId);
  const isMoreOpen = view === 'more';
  const isFront = view === null || view === 'more';
  const frontFooter = (
    <div className='space-y-2'>
      {statusError !== null && (
        <p role='alert' className='text-destructive text-sm'>
          {statusError}
        </p>
      )}
      {undoable !== null && statusError === null && (
        <div role='status' className='flex items-center justify-between gap-3'>
          <p className='text-muted-foreground min-w-0 text-sm'>
            {undoable.message}
          </p>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className='h-10 shrink-0 px-4 tabular-nums'
            disabled={isWorking}
            onClick={undo}
          >
            {undoLabel} · {undoable.secondsLeft}
          </Button>
        </div>
      )}
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          rounded='full'
          className='max-[359px]:px-4'
          onClick={onModify}
        >
          Modify
        </Button>
        {primary()}
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label='More for this thing'
          aria-expanded={isMoreOpen}
          onClick={() => (isMoreOpen ? back() : open('more'))}
          className={join(
            'text-foreground! size-10 min-w-10 shrink-0 p-0',
            isMoreOpen && 'bg-accent!',
          )}
        >
          <Ellipsis className='size-5' aria-hidden='true' />
        </Button>
      </div>
    </div>
  );

  const getFooter = () => {
    if (isFront) return frontFooter;
    if (view === 'history') return undefined;
    return <div ref={setFooterNode} />;
  };

  return (
    <DetailSheet
      isOpen
      onClose={closeDrawer}
      title={name}
      viewKey={view ?? 'thing'}
      footer={getFooter()}
    >
      {isMoreOpen && (
        <div className='space-y-5'>
          <BackLink onBack={back} label={name} />
          <ActionGroup isRoomy>
            {moreActions.map((action) => (
              <ActionRow
                key={action.key}
                isGrouped
                isRoomy
                icon={action.icon}
                label={action.label}
                subtitle={action.subtitle}
                hasChevron={action.hasChevron}
                isDisabled={isWorking}
                onClick={action.onClick}
              />
            ))}
          </ActionGroup>
          {isOnTheList && (
            <ActionGroup isRoomy>
              {publicLinkId !== null && !isSaleFinished && (
                <CopyThingLinkRow item={item} linkId={publicLinkId} />
              )}
              <CopyListingTextRow item={item} uid={uid} />
              <SavePhotosRow item={item} />
            </ActionGroup>
          )}
          {canDelete && (
            <ActionGroup isRoomy>
              <ActionRow
                isGrouped
                isRoomy
                isDestructive
                icon={<Trash2 />}
                label='Delete thing'
                subtitle={
                  isSeller ? undefined : formatAddedAgo(item.createdAt, now)
                }
                onClick={() => {
                  void deleteThing(item).then((isDeleted) => {
                    if (isDeleted) onClose();
                  });
                }}
              />
            </ActionGroup>
          )}
        </div>
      )}
      {(view === 'markPending' || view === 'changeHold') && (
        <MarkPendingView
          item={item}
          inquiries={inquiries ?? []}
          uid={uid}
          now={now}
          mode={view === 'changeHold' ? 'CHANGE' : 'MARK'}
          draft={hold}
          onDraft={setHold}
          footerNode={footerNode}
          onBack={goBack}
          onLeave={back}
          onDone={toFront}
        />
      )}
      {view === 'markSold' && (
        <MarkSoldView
          item={item}
          uid={uid}
          now={now}
          draft={soldDraft}
          onDraft={setSoldDraft}
          footerNode={footerNode}
          onBack={goBack}
          onLeave={back}
          onSold={() => setViews(['sold'])}
          onTakeOff={() => void takeOffTheList()}
        />
      )}
      {view === 'sold' && (
        <SoldConfirmation
          item={item}
          now={now}
          markedBy={getMarkedBy()}
          copiedBy={
            item.listingCopiedBy === null ? null : getName(item.listingCopiedBy)
          }
          sold={sold}
          footerNode={footerNode}
          onDone={toFront}
          onNotSold={notSoldAfterAll}
        />
      )}
      {view === 'changePaid' && (
        <ChangePaidView
          item={item}
          uid={uid}
          collectedCents={sold.collectedCents}
          amount={paidAmount}
          onAmount={setPaidAmount}
          footerNode={footerNode}
          onBack={goBack}
          onLeave={back}
          onSaved={toFront}
        />
      )}
      {view === 'history' && (
        <HistoryView item={item} uid={uid} onBack={back} />
      )}
      {view === 'inquiry' && asker !== undefined && (
        <ThingInquiryView
          item={item}
          inquiry={asker}
          now={now}
          canHold={offer === 'MARK_PENDING' && asker.contactClearedAt === null}
          isSaleFinished={isSaleFinished}
          footerNode={footerNode}
          onBack={back}
          onHold={() => {
            setViews((current) => current.slice(0, -1));
            open('markPending', asker);
          }}
        />
      )}
      <div className={join('space-y-4', view !== null && 'hidden')}>
        <PhotoStrip photos={photos} label={name} />
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <StatusDot
            status={item.status}
            label={
              item.status === 'AVAILABLE'
                ? getAvailableLabel(item, isSaleFinished)
                : undefined
            }
          >
            {getStatusFacts(item)}
          </StatusDot>
          {item.askingPriceCents !== null && (
            <PriceTag askingPriceCents={item.askingPriceCents} />
          )}
          <FactsLine
            className='text-muted-foreground min-w-0 text-sm'
            facts={facts}
          />
          {askedCount > 0 && (
            <Button
              type='button'
              variant='tertiary'
              className="text-muted-foreground! relative h-auto p-0 text-sm font-normal after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
              onClick={() =>
                interestRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
            >
              {askedCount} asked
              <ChevronDown className='size-3.5' aria-hidden='true' />
            </Button>
          )}
        </div>
        {isUnderFloor(item) && item.floorPriceCents !== null && (
          <p className='text-muted-foreground text-sm'>
            🔒 Sold under your floor price of{' '}
            {formatCentsShort(item.floorPriceCents)}
          </p>
        )}
        {hasPrivate && (
          <section className='bg-accent/60 border-border space-y-3 rounded-2xl border p-3'>
            <h3 className='text-accent-foreground text-sm font-semibold'>
              🔒 Only you and your co-sellers
            </h3>
            {privateRows.length > 0 && (
              <dl className='grid grid-cols-2 gap-3 text-sm'>
                {privateRows.map((row) => (
                  <div key={row.label} className='min-w-0'>
                    <dt className='text-muted-foreground text-xs'>
                      {row.label}
                    </dt>
                    <dd className='font-medium break-words'>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <StoreLink item={item} />
            {item.notes !== null && (
              <div className='text-sm'>
                <p className='text-muted-foreground text-xs'>Notes</p>
                <p className='break-words whitespace-pre-line'>{item.notes}</p>
              </div>
            )}
          </section>
        )}
        {item.description !== null && (
          <p className='text-sm text-pretty break-words whitespace-pre-line'>
            {item.description}
          </p>
        )}
        <FactsLine
          className='text-muted-foreground min-w-0 text-sm'
          facts={buyerFacts}
        />
        {isNotListed && (
          <p className='text-muted-foreground text-sm text-pretty'>
            Buyers can&apos;t see this yet. It needs a photo, a name and a
            price.
          </p>
        )}
        {isHoldLockedByFinish && (
          <LockedButton
            label={
              item.status === 'PENDING' ? 'Change who or when' : 'Mark pending'
            }
            title='This sale is finished'
          >
            <p>
              This sale is finished, so nothing new can be held. The seller can
              reopen it.
            </p>
          </LockedButton>
        )}
        <section ref={interestRef} className='scroll-mt-2 space-y-4'>
          {(askedCount > 0 || haveInquiriesFailed) && (
            <SectionDivider label='Interest' className='pt-2' />
          )}
          {haveInquiriesFailed && inquiries === null && (
            <p className='text-muted-foreground text-sm'>
              We couldn&apos;t load who asked. Check your connection and try
              again.
            </p>
          )}
          {inquiries !== null && askedCount > 0 && (
            <ul className='space-y-2'>
              {(isInterestExpanded
                ? inquiries
                : inquiries.slice(0, INTEREST_SHOWN)
              ).map((inquiry) => {
                const message = getOwnMessage(inquiry);
                return (
                  <li key={inquiry.id}>
                    <Button
                      type='button'
                      variant='tertiary'
                      className='border-border bg-card h-auto min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left'
                      onClick={() => {
                        setInquiryId(inquiry.id);
                        open('inquiry');
                      }}
                    >
                      <span className='min-w-0 flex-1'>
                        <span className='text-foreground block truncate text-base font-medium'>
                          {getInquirerName(inquiry)}
                        </span>
                        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal text-pretty break-words'>
                          {[
                            isHolder(item.pending, inquiry) ? 'Holding' : null,
                            formatSentAt(inquiry.lastSentAt, now),
                            inquiry.sendCount > 1
                              ? `Sent ${inquiry.sendCount} times`
                              : null,
                          ]
                            .filter((part) => part !== null)
                            .join(' · ')}
                        </span>
                        {message !== null && (
                          <span className='text-foreground mt-1 line-clamp-1 text-sm font-normal break-words'>
                            {message}
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        className='text-muted-foreground size-5 shrink-0'
                        aria-hidden='true'
                      />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {askedCount > INTEREST_SHOWN && !isInterestExpanded && (
            <ShowMoreButton onClick={() => setIsInterestExpanded(true)}>
              Show all {askedCount}
            </ShowMoreButton>
          )}
        </section>
      </div>
      {deleteDialog}
    </DetailSheet>
  );
}

export default ThingDrawer;
