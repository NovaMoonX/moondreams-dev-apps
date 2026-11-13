import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Ellipsis } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import EllipsisDropdown from '@/components/EllipsisDropdown';
import InlineNotice from '@/components/InlineNotice';
import {
  NOTICE_ACTION_CLASSES,
  NOTICE_QUIET_CLASSES,
} from '@/components/noticeActionClasses';
import SectionDivider from '@/components/SectionDivider';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { deferAction } from '@/lib/undo/deferredUndo';
import { useAppSelector } from '@/store';
import { formatCentsShort } from '@/utils/moneyUtils';
import BundleFormSheet from '@apps/going-once/components/bundles/BundleFormSheet';
import BundlePaidView from '@apps/going-once/components/bundles/BundlePaidView';
import BundlePendingView from '@apps/going-once/components/bundles/BundlePendingView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import { STATUS_LABELS } from '@apps/going-once/constants';
import { useSingleFlight } from '@apps/going-once/hooks/useSingleFlight';
import { usePersonNames } from '@apps/going-once/hooks/usePersonNames';
import {
  changeBundleStatus,
  lowerBundleToSeparate,
  keepBundle,
  unbundle,
  type BundleResult,
  type BundleTransition,
} from '@apps/going-once/store/actions/bundleActions';
import {
  selectHandledInquiries,
  selectItemsById,
  selectNewInquiries,
} from '@apps/going-once/store/selectors';
import type { Bundle } from '@apps/going-once/types';
import {
  getBundleParts,
  shouldSuggestUnbundle,
  toUnbundleKey,
} from '@apps/going-once/utils/bundles';
import {
  describeBundleChangeLine,
  describePriceMove,
  formatBundleSold,
  formatSaveShort,
  formatSplitLine,
} from '@apps/going-once/utils/bundleWords';
import { getItemName } from '@apps/going-once/utils/listing';
import { getStatusFacts } from '@apps/going-once/utils/status';
import {
  getHoldStart,
  getSoldDraft,
  isDraftChanged,
  type HoldDraft,
  type SoldDraft,
} from '@apps/going-once/utils/statusDrafts';

type View = 'markPending' | 'markSold' | 'changePaid' | 'history';

interface BundleSheetProps {
  bundle: Bundle;
  uid: string;
  onClose: () => void;
  /** Opens one of its things (the sheet gives way to the thing's drawer). */
  onOpenThing: (itemId: string) => void;
}

const { option } = DropdownMenuFactories;
const CHANGE = 'change';
const UNBUNDLE = 'unbundle';
const HISTORY = 'history';

/** A bundle in full: what it costs against buying its things separately, the things in the deal and the ones that went on their own, its history, and the acts for its status. */
function BundleSheet({ bundle, uid, onClose, onOpenThing }: BundleSheetProps) {
  const now = useNow();
  const itemsById = useAppSelector((state) =>
    selectItemsById(state, bundle.saleId),
  );
  const newInquiries = useAppSelector((state) =>
    selectNewInquiries(state, bundle.saleId),
  );
  const handledInquiries = useAppSelector((state) =>
    selectHandledInquiries(state, bundle.saleId),
  );
  const [views, setViews] = useState<View[]>([]);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isWorking, run } = useSingleFlight();
  const { pending: undoable, showUndo, undo } = useUndoRemoval();
  const [hold, setHold] = useState<HoldDraft>(() => getHoldStart(null, now));
  const [soldDraft, setSoldDraft] = useState<SoldDraft>(() =>
    getSoldDraft({ askingPriceCents: bundle.priceCents }, now),
  );
  const [initialDraft, setInitialDraft] = useState<HoldDraft | SoldDraft>(hold);
  const getName = usePersonNames(
    bundle.history.map((change) => change.byUid),
    uid,
  );

  const parts = getBundleParts(bundle, itemsById);
  const { deal, gone } = parts;
  const isSuggesting = shouldSuggestUnbundle(bundle, parts);
  const view = views.at(-1) ?? null;
  const dealIds = new Set(deal.map((item) => item.id));
  const inquiries = [...newInquiries, ...handledInquiries].filter((inquiry) =>
    dealIds.has(inquiry.itemId),
  );
  const priceMove = describePriceMove(bundle, itemsById);
  const separately = formatCentsShort(parts.separateCents);
  const saving = formatSaveShort(bundle.priceCents, parts.separateCents);
  const history = [...bundle.history].reverse();
  const isOverSeparate =
    bundle.status === 'ACTIVE' &&
    bundle.itemIds.every((id) => itemsById[id] !== undefined) &&
    bundle.priceCents > parts.separateCents;
  const holdFacts = getStatusFacts(
    { status: 'PENDING', pending: deal[0]?.pending ?? null, sale: null },
    false,
  );

  const draftNow = view === 'markPending' ? hold : soldDraft;
  const isDirty = view !== null && isDraftChanged(draftNow, initialDraft);
  const askBefore = {
    isDirty,
    title: 'Discard your changes?',
    message: 'They will not be saved.',
  };
  const back = () => setViews((current) => current.slice(0, -1));
  const toFront = () => setViews([]);
  const goBack = useDiscardGuard({ ...askBefore, onClose: back });
  const closeSheet = useDiscardGuard({ ...askBefore, onClose });

  const open = (next: View) => {
    setError(null);
    if (next === 'history') {
      setViews((current) => [...current, next]);
      return;
    }
    const draft =
      next === 'markPending'
        ? getHoldStart(null, now)
        : getSoldDraft(
            {
              askingPriceCents:
                next === 'changePaid'
                  ? (bundle.sale?.priceCents ?? 0)
                  : bundle.priceCents,
            },
            now,
          );
    if (next === 'markPending') setHold(draft as HoldDraft);
    else setSoldDraft(draft as SoldDraft);
    setInitialDraft(draft);
    setViews((current) => [...current, next]);
  };

  /** One act at a time; a refusal stays in the sheet in words. */
  const apply = (attempt: () => Promise<BundleResult>) =>
    run(async () => {
      setError(null);
      const result = await attempt();
      if (!result.ok) setError(result.message);
      return result;
    });
  const transition = (next: BundleTransition) =>
    apply(() => changeBundleStatus(bundle.saleId, bundle.id, uid, next));

  const notSoldAfterAll = async () => {
    const { sale } = bundle;
    if (sale === null) return;
    const result = await transition({ kind: 'NOT_SOLD' });
    if (result?.ok)
      showUndo(
        'Back to available',
        () =>
          void transition({
            kind: 'MARK_SOLD',
            priceCents: sale.priceCents,
            method: sale.method,
            soldOn: sale.soldOn,
          }),
      );
  };

  const startUnbundle = () => {
    deferAction(
      toUnbundleKey(bundle.id),
      `Unbundled ${bundle.name}`,
      async () => {
        const result = await unbundle(bundle.saleId, bundle.id, uid);
        return result.ok ? null : result.message;
      },
    );
    onClose();
  };

  const moreItems = [
    ...(bundle.status === 'ACTIVE'
      ? [option({ label: 'Change name, price or things', value: CHANGE })]
      : []),
    option({ label: 'Unbundle', value: UNBUNDLE }),
    option({ label: 'History', value: HISTORY }),
  ];
  const moreMenu = (
    <EllipsisDropdown
      ariaLabel='More for this bundle'
      variant='secondary'
      icon={<Ellipsis className='size-5' aria-hidden='true' />}
      className='text-foreground! size-10 min-w-10 shrink-0 rounded-full p-0'
      disabled={isWorking}
      items={moreItems}
      onItemSelect={(value) => {
        if (value === CHANGE) setIsEditing(true);
        else if (value === UNBUNDLE) startUnbundle();
        else open('history');
      }}
    />
  );

  const lowerToSeparate = () =>
    apply(() => lowerBundleToSeparate(bundle.saleId, bundle.id, uid));

  const keepIt = () => {
    setError(null);
    keepBundle(bundle.saleId, bundle.id, uid, gone.length).catch(() =>
      setError("Couldn't keep the bundle. Try again in a moment."),
    );
  };

  const getSuggestion = () =>
    deal.length === 1
      ? `Only ${getItemName(deal[0])} is left in this bundle.`
      : "Most of it went on its own. Sell what's left separately?";

  const renderThing = (id: string) => {
    const item = itemsById[id];
    if (item === undefined) return null;
    return (
      <li key={id}>
        <Button
          type='button'
          variant='tertiary'
          className='border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left'
          onClick={() => onOpenThing(id)}
        >
          <ThingThumb item={item} />
          <span className='min-w-0 flex-1'>
            <span className='text-foreground line-clamp-2 text-base font-medium break-words'>
              {getItemName(item)}
            </span>
            {item.isBundleOnly && (
              <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal break-words'>
                Only with the bundle
              </span>
            )}
          </span>
          {item.askingPriceCents !== null && (
            <PriceTag askingPriceCents={item.askingPriceCents} />
          )}
        </Button>
      </li>
    );
  };

  const renderGoneThing = (id: string) => {
    const item = itemsById[id];
    if (item === undefined) return null;
    return (
      <li key={id}>
        <Button
          type='button'
          variant='tertiary'
          className='border-border bg-card h-auto min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left'
          onClick={() => onOpenThing(id)}
        >
          <span className='contents [&>*]:opacity-60'>
            <ThingThumb item={item} className='size-10' />
            <span className='text-foreground line-clamp-2 min-w-0 flex-1 text-base font-medium break-words'>
              {getItemName(item)} · {STATUS_LABELS[item.status]}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground size-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
      </li>
    );
  };

  const getFooterButtons = () => {
    if (bundle.status === 'ACTIVE')
      return (
        <>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            rounded='full'
            className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
            disabled={isWorking}
            onClick={() => open('markPending')}
          >
            <span className='max-[360px]:hidden'>Mark pending</span>
            <span className='min-[360px]:hidden'>Pending</span>
          </Button>
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
            disabled={isWorking}
            onClick={() => open('markSold')}
          >
            Mark sold
          </Button>
          {moreMenu}
        </>
      );
    if (bundle.status === 'PENDING')
      return (
        <>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            rounded='full'
            className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
            disabled={isWorking}
            onClick={() => void transition({ kind: 'BACK_TO_AVAILABLE' })}
          >
            <span className='max-[360px]:hidden'>Back to available</span>
            <span className='min-[360px]:hidden'>Put back</span>
          </Button>
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
            disabled={isWorking}
            onClick={() => open('markSold')}
          >
            Mark sold
          </Button>
          {moreMenu}
        </>
      );
    return (
      <>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          rounded='full'
          className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
          disabled={isWorking}
          onClick={() => open('changePaid')}
        >
          <span className='max-[360px]:hidden'>Change what was paid</span>
          <span className='min-[360px]:hidden'>Change paid</span>
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          rounded='full'
          className='min-w-0 flex-1 basis-0 whitespace-nowrap max-[359px]:px-3'
          disabled={isWorking}
          onClick={() => void notSoldAfterAll()}
        >
          <span className='max-[360px]:hidden'>Not sold after all</span>
          <span className='min-[360px]:hidden'>Not sold</span>
        </Button>
        {moreMenu}
      </>
    );
  };

  const frontFooter = (
    <div className='space-y-2'>
      {error !== null && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {undoable !== null && error === null && (
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
            Undo · {undoable.secondsLeft}
          </Button>
        </div>
      )}
      <div className='flex items-center gap-2'>{getFooterButtons()}</div>
    </div>
  );

  if (isEditing)
    return (
      <BundleFormSheet
        saleId={bundle.saleId}
        uid={uid}
        bundle={bundle}
        startItemIds={[]}
        onClose={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    );

  return (
    <DetailSheet
      isOpen
      onClose={closeSheet}
      title={bundle.name}
      viewKey={view ?? 'bundle'}
      footer={view === null ? frontFooter : <div ref={setFooterNode} />}
    >
      {view === 'markPending' && (
        <BundlePendingView
          bundle={bundle}
          inquiries={inquiries}
          uid={uid}
          now={now}
          draft={hold}
          onDraft={setHold}
          footerNode={footerNode}
          onBack={goBack}
          onLeave={back}
          onDone={toFront}
        />
      )}
      {(view === 'markSold' || view === 'changePaid') && (
        <BundlePaidView
          bundle={bundle}
          deal={deal}
          mode={view === 'markSold' ? 'SELL' : 'CHANGE'}
          uid={uid}
          now={now}
          draft={soldDraft}
          onDraft={setSoldDraft}
          footerNode={footerNode}
          onBack={goBack}
          onLeave={back}
          onDone={toFront}
        />
      )}
      {view === 'history' && (
        <div className='space-y-5'>
          <BackLink onBack={back} label='History' />
          <ul className='divide-border border-border divide-y overflow-hidden rounded-2xl border'>
            {history.map((change, index) => (
              <li
                key={`${change.at}-${change.kind}-${index}`}
                className='px-3 py-2.5 break-words'
              >
                {describeBundleChangeLine(change, { getName, itemsById })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={join('space-y-4', view !== null && 'hidden')}>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <StatusDot
            status={bundle.status === 'ACTIVE' ? 'AVAILABLE' : bundle.status}
          />
          <PriceTag askingPriceCents={bundle.priceCents} />
        </div>
        {saving !== null && !isOverSeparate && (
          <p className='text-muted-foreground text-sm'>
            Separately {separately} · {saving}
          </p>
        )}
        {priceMove !== null && (
          <p className='text-muted-foreground text-sm text-pretty'>
            {priceMove}
          </p>
        )}
        {bundle.status === 'PENDING' && (
          <p className='text-sm text-pretty'>
            {holdFacts === ''
              ? 'Held for a buyer, no name or day yet.'
              : `Held ${holdFacts}`}
          </p>
        )}
        {bundle.status === 'SOLD' && bundle.sale !== null && (
          <div className='space-y-1 text-sm'>
            <p className='font-medium'>{formatBundleSold(bundle)}</p>
            <p className='text-muted-foreground text-pretty'>
              {formatSplitLine(bundle.sale.priceCents, deal)}
            </p>
          </div>
        )}
        {isOverSeparate && (
          <InlineNotice tone='info'>
            <div className='space-y-3'>
              <p className='text-pretty'>
                A price changed, so the bundle costs more than its things do
                separately. Buyers see {separately} until you change it.
              </p>
              <Button
                type='button'
                size='sm'
                className={NOTICE_ACTION_CLASSES.info}
                disabled={isWorking}
                onClick={() => void lowerToSeparate()}
              >
                Make it {separately}
              </Button>
            </div>
          </InlineNotice>
        )}
        {isSuggesting && (
          <InlineNotice tone='info'>
            <p className='text-pretty'>{getSuggestion()}</p>
            <div className='mt-2 flex flex-wrap items-center gap-x-5 gap-y-2'>
              <Button
                type='button'
                size='sm'
                className={NOTICE_ACTION_CLASSES.info}
                disabled={isWorking}
                onClick={startUnbundle}
              >
                Unbundle what&apos;s left
              </Button>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className={NOTICE_QUIET_CLASSES.info}
                onClick={keepIt}
              >
                Keep the bundle
              </Button>
            </div>
          </InlineNotice>
        )}
        <ul className='space-y-2'>
          {deal.map((item) => renderThing(item.id))}
        </ul>
        {gone.length > 0 && (
          <>
            <SectionDivider label={`No longer in the deal · ${gone.length}`} />
            <ul className='space-y-2'>
              {gone.map((item) => renderGoneThing(item.id))}
            </ul>
          </>
        )}
      </div>
    </DetailSheet>
  );
}

export default BundleSheet;
