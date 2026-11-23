import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { EMAIL_TICKETS_GATE_ID } from '@apps/a-list/constants';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  selectEmailEvents,
  selectEmailProgress,
  selectIsEmailLoaded,
} from '@apps/a-list/store/selectors';
import { getUnseenChanges } from '@apps/a-list/utils/emailEvents';

/** A small card on the calendar when AMC emails changed showings since the member last looked; nothing while the switch is closed or setup isn't done. */
function EmailChangesNotice() {
  const { user } = useAuth();
  const isOpen = useIsGateOpen('a-list', EMAIL_TICKETS_GATE_ID);
  const { openOverlay } = useAListOverlay();
  const events = useAppSelector(selectEmailEvents);
  const progress = useAppSelector(selectEmailProgress);
  const isLoaded = useAppSelector(selectIsEmailLoaded);

  if (!isOpen || !isLoaded || !user || progress?.doneAt == null) return null;
  const unseen = getUnseenChanges(events, progress.noticeSeenThrough ?? null);
  if (unseen.length === 0) return null;

  return (
    <div className='bg-secondary/60 rounded-2xl'>
      <Button
        type='button'
        variant='base'
        className='flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left'
        onClick={() => openOverlay({ kind: 'emailTickets' })}
      >
        <span
          aria-hidden='true'
          className='bg-background grid size-10 shrink-0 place-items-center rounded-full text-xl leading-none shadow-sm'
        >
          🍿
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block text-sm font-medium'>
            {unseen.length === 1
              ? '1 showing changed'
              : `${unseen.length} showings changed`}
          </span>
          <span className='text-muted-foreground block text-xs'>
            From your AMC emails
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </div>
  );
}

export default EmailChangesNotice;
