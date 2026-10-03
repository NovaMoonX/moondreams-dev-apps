import { useState } from 'react';

import { Badge, Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  ChevronLeft,
  Pencil,
  Ticket as TicketIcon,
  Trash2,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDate, formatTime } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import EditViewingForm from '@apps/a-list/components/viewing/EditViewingForm';
import TicketForm from '@apps/a-list/components/viewing/TicketForm';
import {
  recordTicket,
  removeViewing,
  updateViewingShowtime,
} from '@apps/a-list/store/actions/viewingActions';
import {
  selectMembership,
  selectViewingById,
} from '@apps/a-list/store/selectors';
import type { Ticket } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';

type DrawerView = 'details' | 'edit' | 'ticket';

interface ViewingDrawerProps {
  viewingId: string;
  onClose: () => void;
}

function ViewingDrawer({ viewingId, onClose }: ViewingDrawerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const now = useNow();
  const viewing = useAppSelector((state) =>
    selectViewingById(state, viewingId),
  );
  const membership = useAppSelector(selectMembership);
  const [view, setView] = useState<DrawerView>('details');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSaveShowtime = (showtimeAt: number) =>
    runSave(
      () =>
        dispatch(
          updateViewingShowtime({
            uid: user.uid,
            id: viewing.id,
            showtimeAt,
            runtimeMinutes: viewing.movie.runtimeMinutes,
          }),
        ).unwrap(),
      'Unable to save this showing.',
    );

  const handleSaveTicket = (nextTicket: Ticket | null) =>
    runSave(
      () =>
        dispatch(
          recordTicket({ uid: user.uid, id: viewing.id, ticket: nextTicket }),
        ).unwrap(),
      'Unable to save this ticket.',
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
      <span className='h-24 w-16 shrink-0 overflow-hidden rounded-md'>
        <PosterCover
          title={viewing.movie.title}
          posterUrl={viewing.movie.posterUrl}
        />
      </span>
      <div className='min-w-0 space-y-1'>
        <p className='font-semibold'>{viewing.movie.title}</p>
        <p className='text-muted-foreground text-sm'>
          {formatDate(viewing.showtimeAt)} · {formatTime(viewing.showtimeAt)}
        </p>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Badge
            variant={viewing.status === 'SEEN' ? 'success' : 'muted'}
            size='xs'
          >
            {viewing.status === 'SEEN' ? 'Seen' : 'Planned'}
          </Badge>
          {ticket && <FormatBadge format={ticket.format} />}
        </div>
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
            onSave={(showtimeAt) => void handleSaveShowtime(showtimeAt)}
          />
        </div>
      );
    }

    if (view === 'ticket') {
      return (
        <div className='space-y-4'>
          {backLink}
          <p className='font-semibold'>Ticket</p>
          <TicketForm
            ticket={ticket}
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
        {header}
        <div className='bg-muted/50 divide-border divide-y rounded-lg'>
          <Button
            type='button'
            variant='tertiary'
            className='w-full justify-start gap-2 rounded-none'
            onClick={() => setView('ticket')}
          >
            <TicketIcon className='h-4 w-4' />{' '}
            {ticket ? 'Edit ticket' : 'Mark paid'}
          </Button>
          <Button
            type='button'
            variant='tertiary'
            className='w-full justify-start gap-2 rounded-none'
            onClick={() => setView('edit')}
          >
            <Pencil className='h-4 w-4' /> Edit
          </Button>
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
    <Drawer isOpen onClose={onClose} title='Movie'>
      {getContent()}
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </Drawer>
  );
}

export default ViewingDrawer;
