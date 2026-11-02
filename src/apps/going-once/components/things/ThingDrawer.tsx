import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BadgeDollarSign,
  Clock,
  Ellipsis,
  Eye,
  EyeOff,
  History,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import PhotoStrip from '@/components/PhotoStrip';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { parseHttpUrl } from '@/utils/urlUtils';
import ChangePaidView from '@apps/going-once/components/things/ChangePaidView';
import HistoryView from '@apps/going-once/components/things/HistoryView';
import MarkPendingView from '@apps/going-once/components/things/MarkPendingView';
import MarkSoldView from '@apps/going-once/components/things/MarkSoldView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import SoldConfirmation from '@apps/going-once/components/things/SoldConfirmation';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { useDeleteThing } from '@apps/going-once/hooks/useDeleteThing';
import { usePersonNames } from '@apps/going-once/hooks/usePersonNames';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import {
  changeStatus,
  type StatusTransition,
} from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';
import {
  canDeleteItem,
  formatAddedAgo,
  formatAskingPrice,
  getItemName,
  isListable,
} from '@apps/going-once/utils/listing';
import {
  getStatusFacts,
  getThingOffer,
  type StatusFigures,
} from '@apps/going-once/utils/status';

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
}

type View =
  'more' | 'markPending' | 'markSold' | 'sold' | 'changePaid' | 'history';

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

const getPrivateRows = (item: Item): Row[] => {
  const asking = formatAskingPrice(item.askingPriceCents);
  const bought = [
    item.boughtFrom,
    item.boughtOn === null ? null : formatDateUTC(item.boughtOn),
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return [
    { label: 'Asking price', value: asking ?? 'No price yet' },
    {
      label: 'Floor price',
      value:
        item.floorPriceCents === null
          ? 'None set'
          : formatCentsShort(item.floorPriceCents),
    },
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
}: ThingDrawerProps) {
  const [views, setViews] = useState<View[]>([]);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const now = useNow();
  const { deleteThing, dialog: deleteDialog } = useDeleteThing(
    item.saleId,
    uid,
  );
  const { pending: undoable, showUndo, undo } = useUndoRemoval();
  const getName = usePersonNames(
    item.sale === null ? [] : [item.sale.markedBy],
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
    isListable(item) ? null : { key: 'unlisted', content: 'Not listed yet' },
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
  const canDelete = canDeleteItem(item, { isSeller, uid, now });
  const offer = getThingOffer(item.status, isListable(item));
  const isOnTheList = item.status === 'AVAILABLE' || item.status === 'PENDING';

  const open = (next: View) => {
    setStatusError(null);
    setViews((current) => [...current, next]);
  };
  const back = () => setViews((current) => current.slice(0, -1));
  const toFront = () => setViews([]);

  const run = async (transition: StatusTransition) => {
    setStatusError(null);
    const result = await changeStatus(item.saleId, item.id, uid, transition);
    if (!result.ok) setStatusError(result.message);
    return result.ok;
  };
  const takeOffTheList = async () => {
    toFront();
    const restorePending = item.pending;
    if (await run({ kind: 'TAKE_OFF' }))
      showUndo('Taken off the list', () => {
        void run({ kind: 'PUT_BACK', restorePending });
      });
  };
  const putBackOnTheList = async () => {
    toFront();
    if (await run({ kind: 'PUT_BACK', restorePending: null }))
      showUndo('Put back on the list', () => {
        void run({ kind: 'TAKE_OFF' });
      });
  };
  const runAndReturn = async (transition: StatusTransition) => {
    toFront();
    await run(transition);
  };

  const moreActions: MoreAction[] = [
    offer === 'FINISH'
      ? {
          key: 'markPending',
          icon: <Clock />,
          label: 'Mark pending',
          subtitle: 'Buyers still see it, marked Pending',
          hasChevron: true,
          onClick: () => open('markPending'),
        }
      : null,
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
    item.status === 'PENDING'
      ? {
          key: 'backToAvailable',
          icon: <Undo2 />,
          label: 'Back to available',
          subtitle:
            'The pickup fell through. Buyers see it as Available again.',
          onClick: () => void runAndReturn({ kind: 'BACK_TO_AVAILABLE' }),
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
          subtitle: 'Back to Available, and out of Collected',
          onClick: () => void runAndReturn({ kind: 'NOT_SOLD' }),
        }
      : null,
    isOnTheList
      ? {
          key: 'takeOff',
          icon: <EyeOff />,
          label: 'Take off the list',
          subtitle:
            'Keeping it or gave it away. Leaves the public page and the totals.',
          onClick: () => void takeOffTheList(),
        }
      : null,
    item.status === 'WITHDRAWN'
      ? {
          key: 'putBack',
          icon: <Eye />,
          label: 'Put it back on the list',
          subtitle: 'Back on the public page as Available',
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
    if (offer === null) return null;
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
        className='min-w-0 flex-1 whitespace-nowrap'
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
            onClick={undo}
          >
            Undo · {undoable.secondsLeft}
          </Button>
        </div>
      )}
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          rounded='full'
          className={join(offer === null && 'flex-1')}
          onClick={onModify}
        >
          Modify
        </Button>
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
        {primary()}
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
      onClose={onClose}
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
                onClick={action.onClick}
              />
            ))}
          </ActionGroup>
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
      {view === 'markPending' && (
        <MarkPendingView
          item={item}
          uid={uid}
          now={now}
          footerNode={footerNode}
          onBack={back}
          onDone={toFront}
        />
      )}
      {view === 'markSold' && (
        <MarkSoldView
          item={item}
          uid={uid}
          now={now}
          footerNode={footerNode}
          onBack={back}
          onSold={() => setViews(['sold'])}
        />
      )}
      {view === 'sold' && (
        <SoldConfirmation
          item={item}
          uid={uid}
          now={now}
          markedBy={getMarkedBy()}
          sold={sold}
          footerNode={footerNode}
          onDone={toFront}
        />
      )}
      {view === 'changePaid' && (
        <ChangePaidView
          item={item}
          uid={uid}
          collectedCents={sold.collectedCents}
          footerNode={footerNode}
          onBack={back}
          onSaved={toFront}
        />
      )}
      {view === 'history' && (
        <HistoryView item={item} uid={uid} onBack={back} />
      )}
      <div className={join('space-y-4', view !== null && 'hidden')}>
        <PhotoStrip photos={photos} label={name} />
        <StatusDot status={item.status}>{getStatusFacts(item)}</StatusDot>
        <div className='flex items-center gap-3'>
          {item.askingPriceCents !== null && (
            <PriceTag askingPriceCents={item.askingPriceCents} />
          )}
          <FactsLine
            className='text-muted-foreground min-w-0 text-sm'
            facts={facts}
          />
        </div>
        {item.description !== null && (
          <p className='text-sm break-words whitespace-pre-line'>
            {item.description}
          </p>
        )}
        <FactsLine
          className='text-muted-foreground min-w-0 text-sm'
          facts={buyerFacts}
        />
        {!isListable(item) && (
          <p className='text-muted-foreground text-sm'>
            Buyers can&apos;t see this yet. It needs a photo, a name and a
            price.
          </p>
        )}
        <section className='bg-accent/60 border-border space-y-3 rounded-2xl border p-3'>
          <h3 className='text-accent-foreground text-sm font-semibold'>
            🔒 Only you and your co-sellers
          </h3>
          <dl className='grid grid-cols-2 gap-3 text-sm'>
            {getPrivateRows(item).map((row) => (
              <div key={row.label} className='min-w-0'>
                <dt className='text-muted-foreground text-xs'>{row.label}</dt>
                <dd className='font-medium break-words'>{row.value}</dd>
              </div>
            ))}
          </dl>
          <StoreLink item={item} />
          {item.notes !== null && (
            <div className='text-sm'>
              <p className='text-muted-foreground text-xs'>Notes</p>
              <p className='break-words whitespace-pre-line'>{item.notes}</p>
            </div>
          )}
        </section>
      </div>
      {deleteDialog}
    </DetailSheet>
  );
}

export default ThingDrawer;
