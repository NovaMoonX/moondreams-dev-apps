import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { EMAIL_TICKETS_GATE_ID } from '@apps/a-list/constants';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { markEmailChangesSeen } from '@apps/a-list/store/actions/emailActions';
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

  const dismiss = () => {
    markEmailChangesSeen(user.uid, unseen[0].receivedAt).catch(() => undefined);
  };

  return (
    <div className='bg-secondary/60 flex items-center gap-3 rounded-2xl py-3 pr-2 pl-3'>
      <span
        aria-hidden='true'
        className='bg-card grid size-10 shrink-0 place-items-center rounded-full text-xl leading-none shadow-sm'
      >
        🍿
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>
          {unseen.length === 1
            ? '1 showing changed'
            : `${unseen.length} showings changed`}
        </p>
        <p className='text-muted-foreground text-xs'>From your AMC emails</p>
      </div>
      <Button
        type='button'
        variant='primary'
        size='sm'
        rounded='full'
        className="relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
        onClick={() => openOverlay({ kind: 'emailTickets' })}
      >
        See
        <span className='max-[359px]:hidden'>&nbsp;them</span>
      </Button>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        rounded='full'
        aria-label='Dismiss email changes'
        className="relative size-8 shrink-0 p-0 before:absolute before:-inset-1 before:content-['']"
        onClick={dismiss}
      >
        <X className='size-4' aria-hidden='true' />
      </Button>
    </div>
  );
}

export default EmailChangesNotice;
