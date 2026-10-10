import { useState, type ReactNode } from 'react';

import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  ChevronLeft,
  CircleCheck,
  Pencil,
  ShoppingBag,
  Ticket as TicketIcon,
  Trash2,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDate, formatTime } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import StarRating from '@/components/StarRating';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import EditViewingForm from '@apps/a-list/components/viewing/EditViewingForm';
import BuyTicketsPanel from '@apps/a-list/components/viewing/BuyTicketsPanel';
import TicketForm from '@apps/a-list/components/viewing/TicketForm';
import {
  markViewingSeen,
  recordTicket,
  removeViewing,
  setPurchaseStarted,
  updateViewing,
} from '@apps/a-list/store/actions/viewingActions';
import {
  selectMembership,
  selectViewingById,
} from '@apps/a-list/store/selectors';
import type {
  ShowtimeOption,
  TheatreSnapshot,
  Ticket,
} from '@apps/a-list/types';
import {
  canBuyTickets,
  describePurchase,
  toPurchasePlan,
} from '@apps/a-list/utils/purchase';
import { formatCents } from '@apps/a-list/utils/money';

interface ActionRowProps {
  icon: ReactNode;
  label: string;
  subtitle?: string;
  onClick: () => void;
}

function ActionRow({ icon, label, subtitle, onClick }: ActionRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto min-h-12 w-full justify-start gap-3 rounded-none py-2 text-left'
      onClick={onClick}
    >
      <span className='w-5 shrink-0' aria-hidden='true'>
        {icon}
      </span>
      <span className='min-w-0 text-left'>
        <span className='block'>{label}</span>
        {subtitle && (
          <span className='text-muted-foreground block text-xs font-normal'>
            {subtitle}
          </span>
        )}
      </span>
    </Button>
  );
}

type DrawerView = 'details' | 'edit' | 'ticket' | 'seen' | 'buy';

interface ViewingPanelProps {
  viewingId: string;
  /** Leaves the viewing: after a removal, or when there's nothing more to show. */
  onClose: () => void;
  /** Set when the panel sits inside a list's drawer, so the details view can step back to it. */
  onBack?: () => void;
  backLabel?: string;
}

/** A viewing's details and actions, for a drawer to hold; it swaps its own content in place instead of stacking overlays. */
export function ViewingPanel({
  viewingId,
  onClose,
  onBack,
  backLabel = 'Back',
}: ViewingPanelProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { closeOverlay } = useAListOverlay();
  const now = useNow();
  const viewing = useAppSelector((state) =>
    selectViewingById(state, viewingId),
  );
  const membership = useAppSelector(selectMembership);
  const [view, setView] = useState<DrawerView>('details');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenRating, setSeenRating] = useState<number | null>(null);

  if (!viewing || !user || !membership) {
    return null;
  }

  const ticket = viewing.ticket ?? null;

  const runSave = async (action: () => Promise<unknown>, fallback: string) => {
    setIsSaving(true);
    setError(null);

    try {
      await action();
      setView('details');
    } catch (saveError) {
      setError(getErrorMessage(saveError, fallback));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShowtime = ({
    showtimeAt,
    rating,
    theatre,
  }: {
    showtimeAt: number;
    rating?: number | null;
    theatre: TheatreSnapshot | null;
  }) =>
    runSave(
      () =>
        dispatch(
          updateViewing({
            uid: user.uid,
            id: viewing.id,
            showtimeAt,
            runtimeMinutes: viewing.movie.runtimeMinutes,
            rating,
            theatre,
            // A plan points at one showing at one theater, so moving either one drops it.
            ...(viewing.purchase &&
            (showtimeAt !== viewing.showtimeAt ||
              theatre?.theatreId !== viewing.theatre?.theatreId)
              ? { purchase: null }
              : {}),
          }),
        ).unwrap(),
      'Unable to save this showing.',
    );

  const handlePickShowtime = async (option: ShowtimeOption) => {
    setIsSaving(true);
    setError(null);
    try {
      await dispatch(
        updateViewing({
          uid: user.uid,
          id: viewing.id,
          showtimeAt: option.startsAt,
          runtimeMinutes: viewing.movie.runtimeMinutes,
          purchase: toPurchasePlan(option),
        }),
      ).unwrap();
    } catch (pickError) {
      setError(getErrorMessage(pickError, 'Unable to save this showtime.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChooseTheater = async (chosen: TheatreSnapshot) => {
    setIsSaving(true);
    setError(null);
    try {
      await dispatch(
        updateViewing({
          uid: user.uid,
          id: viewing.id,
          showtimeAt: viewing.showtimeAt,
          runtimeMinutes: viewing.movie.runtimeMinutes,
          theatre: chosen,
          // A plan names a showtime at the old theater, so it goes when the theater changes.
          ...(viewing.theatre?.theatreId === chosen.theatreId
            ? {}
            : { purchase: null }),
        }),
      ).unwrap();
    } catch (chooseError) {
      setError(getErrorMessage(chooseError, 'Unable to save this theater.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBuy = () => {
    if (!viewing.purchase) {
      return;
    }

    // Opened straight from the tap, before any await, so phone browsers don't block it as a pop-up.
    window.open(viewing.purchase.purchaseUrl, '_blank', 'noopener,noreferrer');
    dispatch(
      setPurchaseStarted({
        uid: user.uid,
        id: viewing.id,
        startedAt: Date.now(),
      }),
    )
      .unwrap()
      .catch(() =>
        addToast({
          title: "We couldn't note that you left for AMC",
          description:
            "So we won't ask about it when you're back. You can add the ticket from this showing.",
        }),
      );
    // Leaves every drawer, so the welcome-back question has the screen to itself when they return.
    closeOverlay();
  };

  const getTicketRow = () => {
    if (ticket)
      return {
        label: 'Ticket details',
        subtitle: `${formatCents(ticket.totalCents)} total`,
      };
    if (viewing.purchase?.startedAt != null)
      return {
        label: 'Add the fee and tax',
        subtitle: 'Finish the ticket you just bought',
      };
    if (canBuyTickets(viewing, now))
      return {
        label: 'I already have a ticket',
        subtitle: 'Add what you paid',
      };
    return {
      label: 'Add what you paid',
      subtitle: 'Counts toward your savings',
    };
  };

  const handleSaveTicket = (nextTicket: Ticket | null) =>
    runSave(
      () =>
        dispatch(
          recordTicket({ uid: user.uid, id: viewing.id, ticket: nextTicket }),
        ).unwrap(),
      'Unable to save this ticket.',
    );

  const handleMarkSeen = () =>
    runSave(
      () =>
        dispatch(
          markViewingSeen({
            uid: user.uid,
            id: viewing.id,
            rating: seenRating,
          }),
        ).unwrap(),
      'Unable to mark this movie seen.',
    );

  const handleClearTicket = async () => {
    const confirmed = await confirm({
      title: 'Clear ticket',
      message: `Clear the ticket details for ${viewing.movie.title}? Its savings stop counting until you add them again.`,
      confirmText: 'Clear',
      destructive: true,
    });
    if (confirmed) {
      await handleSaveTicket(null);
    }
  };

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: 'Remove showing',
      message: `Remove ${viewing.movie.title} on ${formatDate(viewing.showtimeAt)}? It stays on your watchlist.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(removeViewing({ uid: user.uid, id: viewing.id })).unwrap();
      addToast({ title: 'Showing removed', description: viewing.movie.title });
      onClose();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to remove this showing.'));
    }
  };

  const header = (
    <div className='flex gap-3'>
      <span className='h-28 w-[4.5rem] shrink-0 overflow-hidden rounded-xl shadow-md'>
        <PosterCover
          title={viewing.movie.title}
          posterUrl={viewing.movie.posterUrl}
        />
      </span>
      <div className='min-w-0 space-y-1'>
        <p className='text-lg leading-tight font-semibold'>
          {viewing.movie.title}
        </p>
        <p className='text-muted-foreground text-sm'>
          {formatDate(viewing.showtimeAt)} · {formatTime(viewing.showtimeAt)}
        </p>
        {viewing.theatre && (
          <p className='text-muted-foreground flex gap-1.5 text-sm'>
            <span className='w-5 shrink-0 text-center' aria-hidden='true'>
              📍
            </span>
            <span className='min-w-0'>{viewing.theatre.name}</span>
          </p>
        )}
        <div className='flex flex-wrap items-center gap-1.5'>
          <ViewingStatusBadge viewing={viewing} now={now} />
          {ticket && <FormatBadge format={ticket.format} />}
          {viewing.status === 'SEEN' && viewing.rating ? (
            <StarRating value={viewing.rating} />
          ) : null}
        </div>
        {viewing.purchase && canBuyTickets(viewing, now) && (
          <p className='text-muted-foreground flex gap-1.5 text-xs'>
            <span className='w-5 shrink-0 text-center' aria-hidden='true'>
              🎟️
            </span>
            <span className='min-w-0'>
              {describePurchase(viewing.purchase)}, before tax and fees
            </span>
          </p>
        )}
        {ticket && (
          <p className='text-muted-foreground text-xs'>
            {formatCents(ticket.priceCents)} +{' '}
            {formatCents(ticket.feeAvoidedCents)} fee +{' '}
            {formatCents(ticket.taxCents)} tax ={' '}
            {formatCents(ticket.totalCents)}
          </p>
        )}
      </div>
    </div>
  );

  const backLink = (
    <Button
      type='button'
      variant='link'
      size='sm'
      className='gap-1 px-0'
      onClick={() => setView('details')}
    >
      <ChevronLeft className='h-4 w-4' /> Back to movie
    </Button>
  );

  const getContent = () => {
    if (view === 'edit') {
      return (
        <div className='space-y-4'>
          {backLink}
          {header}
          <EditViewingForm
            key={viewing.showtimeAt}
            viewing={viewing}
            startDate={membership.startDate}
            now={now}
            isSaving={isSaving}
            onCancel={() => setView('details')}
            onSave={(changes) => void handleSaveShowtime(changes)}
          />
        </div>
      );
    }

    if (view === 'seen') {
      return (
        <div className='space-y-4'>
          {backLink}
          {header}
          <div className='space-y-1'>
            <p className='text-sm font-medium'>
              How was it? Stars are optional.
            </p>
            <StarRating value={seenRating} onChange={setSeenRating} size='lg' />
          </div>
          <div className='flex justify-end'>
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving}
              onClick={() => void handleMarkSeen()}
            >
              Seen it
            </Button>
          </div>
        </div>
      );
    }

    if (view === 'buy') {
      return (
        <div className='space-y-4'>
          {backLink}
          <p className='font-semibold'>Buy tickets</p>
          <BuyTicketsPanel
            viewing={viewing}
            now={now}
            isSaving={isSaving}
            onPick={(option) => void handlePickShowtime(option)}
            onGoBuy={handleGoBuy}
            onChooseTheater={(chosen) => void handleChooseTheater(chosen)}
            onEnterManually={() => setView('ticket')}
          />
        </div>
      );
    }

    if (view === 'ticket') {
      return (
        <div className='space-y-4'>
          {backLink}
          <p className='font-semibold'>Ticket details</p>
          <TicketForm
            ticket={ticket}
            purchase={viewing.purchase ?? null}
            isSaving={isSaving}
            onCancel={() => setView('details')}
            onSave={(nextTicket) => void handleSaveTicket(nextTicket)}
            onClear={() => void handleClearTicket()}
          />
        </div>
      );
    }

    return (
      <div className='space-y-4'>
        {onBack && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='gap-1 px-0'
            onClick={onBack}
          >
            <ChevronLeft className='h-4 w-4' /> {backLabel}
          </Button>
        )}
        {header}
        <div className='bg-muted/50 divide-border divide-y overflow-hidden rounded-2xl'>
          {viewing.status === 'PLANNED' && viewing.endsAt <= now && (
            <ActionRow
              icon={<CircleCheck className='h-4 w-4' />}
              label='Mark as seen'
              subtitle='Rate it if you like'
              onClick={() => setView('seen')}
            />
          )}
          {canBuyTickets(viewing, now) && (
            <ActionRow
              icon={<ShoppingBag className='h-4 w-4' />}
              label='Buy tickets'
              subtitle='See showtimes and prices on AMC'
              onClick={() => setView('buy')}
            />
          )}
          <ActionRow
            icon={<TicketIcon className='h-4 w-4' />}
            {...getTicketRow()}
            onClick={() => setView('ticket')}
          />
          <ActionRow
            icon={<Pencil className='h-4 w-4' />}
            label={
              viewing.status === 'SEEN'
                ? 'Change details or rating'
                : 'Change day, time or theater'
            }
            onClick={() => setView('edit')}
          />
        </div>
        <Button
          type='button'
          variant='tertiary'
          className='text-destructive! w-full justify-start gap-2'
          onClick={() => void handleRemove()}
        >
          <Trash2 className='h-4 w-4' /> Remove
        </Button>
      </div>
    );
  };

  return (
    <>
      {getContent()}
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </>
  );
}

interface ViewingDrawerProps {
  viewingId: string;
  onClose: () => void;
}

function ViewingDrawer({ viewingId, onClose }: ViewingDrawerProps) {
  return (
    <Drawer isOpen onClose={onClose} title='Movie'>
      <ViewingPanel viewingId={viewingId} onClose={onClose} />
    </Drawer>
  );
}

export default ViewingDrawer;
