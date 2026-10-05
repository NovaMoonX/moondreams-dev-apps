import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import EmailInviteJoinModal from '@apps/waypoint/components/EmailInviteJoinModal';
import { tripTitleQueryOptions } from '@apps/waypoint/queries/tripTitleQueries';
import { removeEmailInvite } from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite } from '@apps/waypoint/types';

interface MyEmailInvitesProps {
  uid: string;
  invites: TripEmailInvite[];
  onViewTrip: (tripId: string) => void;
}

const DISMISSED_KEY = 'waypoint.invitesDismissed';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeDismissed = (value: boolean) => {
  try {
    sessionStorage.setItem(DISMISSED_KEY, String(value));
  } catch {
    // The choice still holds for this visit without storage.
  }
};

/** Trips whose Admin already set up the signed-in email. They open once as a prompt to join, then stay one tap away behind an icon button. */
function MyEmailInvites({ uid, invites, onViewTrip }: MyEmailInvitesProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isDismissed, setIsDismissed] = useState(readDismissed);
  const [pinned, setPinned] = useState<TripEmailInvite | null>(null);
  const shown = pinned ?? (isDismissed ? null : (invites[0] ?? null));
  const { data: title } = useQuery({ ...tripTitleQueryOptions(shown?.tripId ?? ''), enabled: shown !== null });

  const close = () => {
    setPinned(null);
    setIsDismissed(true);
    writeDismissed(true);
  };

  const handleDecline = async (invite: TripEmailInvite) => {
    const confirmed = await confirm({
      title: 'Turn down invitation',
      message: `Turn down ${title ?? 'this trip'}? An Admin can add you again later.`,
      confirmText: 'Turn down',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(removeEmailInvite({ tripId: invite.tripId, email: invite.email })).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to turn this down',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <>
      {invites.length > 0 && (
        <Button
          type='button'
          variant='secondary'
          size='icon'
          aria-label={`Trip invitations (${invites.length})`}
          className='relative shrink-0'
          onClick={() => {
            setIsDismissed(false);
            writeDismissed(false);
          }}
        >
          <Mail className='h-4 w-4' />
          <span className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold'>
            {invites.length}
          </span>
        </Button>
      )}
      {shown && (
        <EmailInviteJoinModal
          key={shown.tripId}
          invite={shown}
          uid={uid}
          onJoined={() => setPinned(shown)}
          onDecline={() => void handleDecline(shown)}
          onViewTrip={(tripId) => {
            setPinned(null);
            onViewTrip(tripId);
          }}
          onClose={close}
        />
      )}
    </>
  );
}

export default MyEmailInvites;
