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
  /** Another prompt owns the screen (a join link), so this one waits behind its icon button. */
  isQuiet?: boolean;
  /** The trip the page is trying to open: an invitation to it is shown even if it was put away before. */
  focusTripId?: string | null;
}

const dismissedKey = (uid: string) => `waypoint.invitesDismissed.${uid}`;

const readDismissed = (uid: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(dismissedKey(uid)) ?? '[]') as string[];
  } catch {
    return [];
  }
};

const writeDismissed = (uid: string, tripIds: string[]) => {
  try {
    localStorage.setItem(dismissedKey(uid), JSON.stringify(tripIds));
  } catch {
    // The choice still holds for this visit without storage.
  }
};

/** Trips whose Admin already set up the signed-in email. Each opens once as a prompt to join (remembered per person), then stays one tap away behind an icon button. */
function MyEmailInvites({ uid, invites, onViewTrip, isQuiet = false, focusTripId = null }: MyEmailInvitesProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [dismissed, setDismissed] = useState(() => readDismissed(uid));
  const [pinned, setPinned] = useState<TripEmailInvite | null>(null);
  const focused = invites.find((invite) => invite.tripId === focusTripId);
  const unseen = isQuiet ? undefined : invites.find((invite) => !dismissed.includes(invite.tripId));
  const shown = pinned ?? focused ?? unseen ?? null;
  const { data: title } = useQuery({ ...tripTitleQueryOptions(shown?.tripId ?? ''), enabled: shown !== null });

  const close = () => {
    const next = invites.map((invite) => invite.tripId);
    setPinned(null);
    setDismissed(next);
    writeDismissed(uid, next);
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
          title='Trip invitations'
          className='relative size-10 min-w-10 shrink-0 p-0'
          onClick={() => {
            setDismissed([]);
            writeDismissed(uid, []);
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
            close();
            onViewTrip(tripId);
          }}
          onClose={close}
        />
      )}
    </>
  );
}

export default MyEmailInvites;
