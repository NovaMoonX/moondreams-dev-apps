import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import { useUserInfo } from '@/hooks/useUserInfo';

import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_LABELS } from '@apps/waypoint/constants';
import { tripTitleQueryOptions } from '@apps/waypoint/queries/tripTitleQueries';
import { acceptEmailInvite } from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite } from '@apps/waypoint/types';

interface EmailInviteJoinModalProps {
  invite: TripEmailInvite;
  uid: string;
  /** Called as they join, for a parent whose own state changes under the welcome once the invitation is used up. */
  onJoined?: () => void;
  /** Lets them turn the invitation down; leave out where that isn't offered. */
  onDecline?: () => void;
  onViewTrip: (tripId: string) => void;
  onClose: () => void;
}

/** What someone sees when an Admin already added their email: nothing to request, just a way in. */
function EmailInviteJoinModal({ invite, uid, onJoined, onDecline, onViewTrip, onClose }: EmailInviteJoinModalProps) {
  const dispatch = useAppDispatch();
  const { data: title } = useQuery(tripTitleQueryOptions(invite.tripId));
  const inviter = useUserInfo([invite.invitedBy])?.map[invite.invitedBy];
  const inviterName = inviter?.displayName?.trim() || 'An Admin';
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tripName = <span className='font-semibold'>{title ?? 'this trip'}</span>;

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);
    onJoined?.();
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
      <Modal isOpen onClose={onClose} title='Joined'>
        <div className='space-y-6 pt-1'>
          <p className='text-muted-foreground text-sm'>
            You&apos;re now on {tripName} as {MEMBER_ROLE_LABELS[invite.role]}.
          </p>
          <ModalFooterActions
            cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Close
              </Button>
            }
            rightActions={
              <Button type='button' onClick={() => onViewTrip(invite.tripId)}>
                Open trip
              </Button>
            }
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title='Trip invitation'>
      <div className='space-y-4 pt-1'>
        <p className='text-sm'>
          {inviterName} added you to {tripName}, so you can join without asking.
        </p>
        <div className='bg-muted/60 rounded-xl p-3 text-sm'>
          <p className='font-medium'>Joining as {MEMBER_ROLE_LABELS[invite.role]}</p>
          <p className='text-muted-foreground mt-0.5'>{MEMBER_ROLE_DESCRIPTIONS[invite.role]}</p>
        </div>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          cancelAction={
            <Button type='button' variant='secondary' disabled={isJoining} onClick={onClose}>
              Close
            </Button>
          }
          rightActions={
            <>
              {onDecline && (
                <Button type='button' variant='tertiary' disabled={isJoining} onClick={onDecline}>
                  Not for me
                </Button>
              )}
              <Button type='button' loading={isJoining} disabled={isJoining} onClick={() => void handleJoin()}>
                {isJoining ? 'Joining…' : 'Join'}
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default EmailInviteJoinModal;
