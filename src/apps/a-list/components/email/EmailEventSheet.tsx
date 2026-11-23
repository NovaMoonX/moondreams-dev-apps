import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Clapperboard, Sparkles, Trash2, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmailMessageSheet from '@/components/emailForwarding/EmailMessageSheet';
import StatTile from '@/components/StatTile';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  deleteEmailEvent,
  undoEmailEvent,
  type UndoResult,
} from '@apps/a-list/store/actions/emailActions';
import { selectViewingById } from '@apps/a-list/store/selectors';
import type { AListEmailEvent } from '@apps/a-list/types';
import {
  canUndoEmailEvent,
  describeEmailOutcome,
  MOVED_ON_MESSAGE,
  UNDO_SUBTITLES,
} from '@apps/a-list/utils/emailEvents';

interface EmailEventSheetProps {
  event: AListEmailEvent;
  onClose: () => void;
}

const UNDO_TOASTS: Record<UndoResult, (title: string) => string> = {
  restored: (title) => `${title} is back on your calendar.`,
  alreadyBack: (title) => `${title} was already back on your calendar.`,
  removed: (title) => `${title} is off your calendar.`,
  cleared: (title) => `The ticket is off ${title}; the showing stays.`,
  gone: (title) => `${title} was already off your calendar.`,
  movedOn: () => MOVED_ON_MESSAGE,
};

/** One forwarded email, what it did to the calendar, and the ways to open, undo or clear it. */
function EmailEventSheet({ event, onClose }: EmailEventSheetProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { openOverlay } = useAListOverlay();
  const viewing = useAppSelector((state) =>
    event.viewingId === null ? null : selectViewingById(state, event.viewingId),
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMovedOn, setIsMovedOn] = useState(false);

  const title =
    event.movieTitle ?? event.removedViewing?.movie.title ?? 'The showing';
  const ticket = viewing?.ticket ?? null;
  const isTicketOrder =
    event.outcome === 'added' || event.outcome === 'attached';
  const canUndo = canUndoEmailEvent(event) && !isMovedOn;

  const undo = async () => {
    if (!user) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await dispatch(
        undoEmailEvent({ uid: user.uid, event }),
      ).unwrap();
      if (result === 'movedOn') {
        setIsMovedOn(true);
        setIsBusy(false);
        return;
      }
      addToast({ title: 'Undone', description: UNDO_TOASTS[result](title) });
      onClose();
    } catch (undoError) {
      setError(getErrorMessage(undoError, 'Unable to undo that.'));
      setIsBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    setIsBusy(true);
    setError(null);
    try {
      await deleteEmailEvent(user.uid, event.id);
      onClose();
    } catch (removeError) {
      setError(
        getErrorMessage(removeError, 'Unable to remove this from your list.'),
      );
      setIsBusy(false);
    }
  };

  return (
    <EmailMessageSheet
      from={event.from}
      subject={event.subject}
      receivedAt={event.receivedAt}
      text={event.snippet}
      onClose={onClose}
      outcome={
        <div className='bg-secondary/60 space-y-3 rounded-2xl p-4 text-sm'>
          <span
            aria-hidden='true'
            className='bg-card grid size-11 place-items-center rounded-full text-2xl leading-none shadow-sm'
          >
            🍿
          </span>
          <p className='font-medium'>{describeEmailOutcome(event)}</p>
          {event.readBy === 'ai' && (
            <p className='text-muted-foreground flex items-center gap-1.5'>
              <Sparkles className='size-3.5' aria-hidden='true' />
              Read by AI
            </p>
          )}
          {ticket && (
            <div className='grid grid-cols-3 gap-2'>
              <StatTile
                isStacked
                label='Ticket'
                value={formatCents(ticket.priceCents)}
              />
              <StatTile
                isStacked
                label='Fee waived'
                value={formatCents(ticket.feeAvoidedCents)}
              />
              <StatTile
                isStacked
                label='Tax'
                value={formatCents(ticket.taxCents)}
              />
            </div>
          )}
          {isTicketOrder &&
            event.ticketCount !== null &&
            event.ticketCount > 1 && (
              <p className='text-muted-foreground'>
                This order had {event.ticketCount} tickets; the showing records
                yours.
              </p>
            )}
        </div>
      }
    >
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      {isMovedOn && (
        <p className='text-sm' role='status'>
          {MOVED_ON_MESSAGE}
        </p>
      )}
      <ActionGroup>
        {viewing !== null && (
          <ActionRow
            isGrouped
            hasChevron
            icon={<Clapperboard />}
            label='Open the showing'
            subtitle='See it on your calendar'
            onClick={() => openOverlay({ kind: 'viewing', id: viewing.id })}
          />
        )}
        {canUndo && (
          <ActionRow
            isGrouped
            icon={<Undo2 />}
            label='Undo'
            subtitle={UNDO_SUBTITLES[event.outcome]}
            isDisabled={isBusy}
            onClick={() => void undo()}
          />
        )}
        <ActionRow
          isGrouped
          isDestructive
          icon={<Trash2 />}
          label='Remove from this list'
          subtitle='Only this email; your calendar stays as it is'
          isDisabled={isBusy}
          onClick={() => void remove()}
        />
      </ActionGroup>
    </EmailMessageSheet>
  );
}

export default EmailEventSheet;
