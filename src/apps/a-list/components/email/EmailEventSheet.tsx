import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Clapperboard, Trash2, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmailMessageSheet from '@/components/emailForwarding/EmailMessageSheet';
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
  describeEmailEvent,
  describeEmailOutcome,
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

  const title =
    event.movieTitle ?? event.removedViewing?.movie.title ?? 'The showing';
  const timeZone =
    viewing?.theatre?.timeZone ??
    event.removedViewing?.theatre?.timeZone ??
    null;
  const ticket = viewing?.ticket ?? null;
  const canUndo = canUndoEmailEvent(event);

  const undo = async () => {
    if (!user) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await dispatch(
        undoEmailEvent({ uid: user.uid, event }),
      ).unwrap();
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
        <div className='bg-secondary/60 space-y-1 rounded-2xl px-4 py-3 text-sm'>
          <p className='font-medium'>{describeEmailEvent(event, timeZone)}</p>
          <p className='text-muted-foreground'>{describeEmailOutcome(event)}</p>
          {ticket && (
            <p className='text-muted-foreground'>
              {formatCents(ticket.priceCents)} ticket ·{' '}
              {formatCents(ticket.feeAvoidedCents)} fee waived ·{' '}
              {formatCents(ticket.taxCents)} tax
            </p>
          )}
          {event.ticketCount !== null && event.ticketCount > 1 && (
            <p className='text-muted-foreground'>
              {event.ticketCount} tickets on this order; A-List counts one.
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
      {(viewing !== null || canUndo) && (
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
        </ActionGroup>
      )}
      <Button
        type='button'
        variant='tertiary'
        className='text-muted-foreground w-full justify-start gap-2'
        disabled={isBusy}
        onClick={() => void remove()}
      >
        <Trash2 className='h-4 w-4' /> Remove from this list
      </Button>
    </EmailMessageSheet>
  );
}

export default EmailEventSheet;
