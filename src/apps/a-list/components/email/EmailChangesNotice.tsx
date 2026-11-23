import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Mail } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
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

/** A quiet line on the calendar when AMC emails changed showings since the member last looked; nothing while the switch is closed or setup isn't done. */
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
    <InlineNotice
      tone='info'
      icon={Mail}
      onDismiss={dismiss}
      dismissLabel='Dismiss email changes'
    >
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <p>
          {unseen.length === 1
            ? '1 showing changed'
            : `${unseen.length} showings changed`}{' '}
          from your AMC emails
        </p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className="relative min-h-7 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
          onClick={() => openOverlay({ kind: 'emailTickets' })}
        >
          See
        </Button>
      </div>
    </InlineNotice>
  );
}

export default EmailChangesNotice;
