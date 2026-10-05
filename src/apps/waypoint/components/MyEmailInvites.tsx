import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQueries } from '@tanstack/react-query';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import EmailInviteJoinModal from '@apps/waypoint/components/EmailInviteJoinModal';
import { MEMBER_ROLE_LABELS } from '@apps/waypoint/constants';
import { tripTitleQueryOptions } from '@apps/waypoint/queries/tripTitleQueries';
import { removeEmailInvite } from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite } from '@apps/waypoint/types';

interface MyEmailInvitesProps {
  uid: string;
  invites: TripEmailInvite[];
  onViewTrip: (tripId: string) => void;
}

/** Trips whose Admin already added the signed-in email: one tap to join, no request. */
function MyEmailInvites({ uid, invites, onViewTrip }: MyEmailInvitesProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [joining, setJoining] = useState<TripEmailInvite | null>(null);
  const titleQueries = useQueries({ queries: invites.map((invite) => tripTitleQueryOptions(invite.tripId)) });
  const titles = Object.fromEntries(invites.map((invite, index) => [invite.tripId, titleQueries[index]?.data ?? null]));

  const handleDecline = async (invite: TripEmailInvite) => {
    const confirmed = await confirm({
      title: 'Turn down invitation',
      message: `Turn down the invitation to ${titles[invite.tripId] ?? 'this trip'}? An Admin can invite you again.`,
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

  // The welcome modal outlives the list: joining uses up the invitation, which empties it.
  const modal = joining && (
    <EmailInviteJoinModal
      key={joining.tripId}
      invite={joining}
      uid={uid}
      onViewTrip={(tripId) => {
        setJoining(null);
        onViewTrip(tripId);
      }}
      onClose={() => setJoining(null)}
    />
  );

  if (invites.length === 0) {
    return modal || null;
  }

  return (
    <>
      <section className='bg-accent/60 rounded-2xl'>
        <h2 className='text-accent-foreground px-4 pt-4 pb-2 text-xs font-semibold tracking-wide uppercase'>
          💌 You&apos;re invited
        </h2>
        <ul className='divide-border/60 divide-y'>
          {invites.map((invite) => (
            <li key={invite.tripId} className='flex items-center gap-3 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>{titles[invite.tripId] ?? 'A trip'}</p>
                <p className='text-muted-foreground text-xs'>
                  Join as {MEMBER_ROLE_LABELS[invite.role]} · no request needed
                </p>
              </div>
              <Button type='button' variant='tertiary' size='sm' onClick={() => void handleDecline(invite)}>
                Not for me
              </Button>
              <Button type='button' size='sm' rounded='full' onClick={() => setJoining(invite)}>
                Join
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {modal}
    </>
  );
}

export default MyEmailInvites;
