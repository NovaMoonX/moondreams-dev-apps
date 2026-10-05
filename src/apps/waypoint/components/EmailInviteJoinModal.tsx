import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_EMOJIS, MEMBER_ROLE_LABELS } from '@apps/waypoint/constants';
import { tripTitleQueryOptions } from '@apps/waypoint/queries/tripTitleQueries';
import { acceptEmailInvite } from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite } from '@apps/waypoint/types';

interface EmailInviteJoinModalProps {
  invite: TripEmailInvite;
  uid: string;
  onViewTrip: (tripId: string) => void;
  onClose: () => void;
}

/** What someone sees when an Admin already added their email: nothing to request, just a way in. */
function EmailInviteJoinModal({ invite, uid, onViewTrip, onClose }: EmailInviteJoinModalProps) {
  const dispatch = useAppDispatch();
  const { data: title } = useQuery(tripTitleQueryOptions(invite.tripId));
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tripName = <span className='font-semibold'>{title ?? 'this trip'}</span>;

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);
    try {
      await dispatch(acceptEmailInvite({ uid, invite })).unwrap();
      setHasJoined(true);
    } catch (joinError) {
      setError(getErrorMessage(joinError, 'Unable to join this trip.'));
    } finally {
      setIsJoining(false);
    }
  };

  if (hasJoined) {
    return (
      <Modal isOpen onClose={onClose} title="You're in">
        <div className='space-y-4'>
          <p className='text-5xl' aria-hidden>
            🎉
          </p>
          <p className='text-muted-foreground text-sm'>
            Welcome to {tripName}. You joined as {MEMBER_ROLE_LABELS[invite.role]}.
          </p>
          <ModalFooterActions
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onClose}>
                  Close
                </Button>
                <Button type='button' onClick={() => onViewTrip(invite.tripId)}>
                  Open trip
                </Button>
              </>
            }
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="You're on the list">
      <div className='space-y-4'>
        <p className='text-5xl' aria-hidden>
          💌
        </p>
        <p className='text-sm'>
          An Admin already added <span className='font-medium'>{invite.email}</span> to {tripName}. There&apos;s nothing
          to request: join now and you&apos;re in.
        </p>
        <div className='bg-muted/50 rounded-2xl p-3 text-sm'>
          <p className='font-medium'>
            {MEMBER_ROLE_EMOJIS[invite.role]} You&apos;ll join as {MEMBER_ROLE_LABELS[invite.role]}
          </p>
          <p className='text-muted-foreground mt-0.5'>{MEMBER_ROLE_DESCRIPTIONS[invite.role]}</p>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button type='button' variant='secondary' disabled={isJoining} onClick={onClose}>
                Not now
              </Button>
              <Button type='button' loading={isJoining} disabled={isJoining} onClick={() => void handleJoin()}>
                {isJoining ? 'Joining…' : 'Join trip'}
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default EmailInviteJoinModal;
