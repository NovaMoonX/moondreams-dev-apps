import { useState } from 'react';

import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { ModalProps } from '@moondreamsdev/dreamer-ui/components';

import { getErrorMessage } from '@/utils/errorUtils';
import type { TripJoinRequest, TripSpace } from '@apps/waypoint/types';
import { useTripInvite } from '@apps/waypoint/hooks/useTripInvite';

interface JoinTripModalProps {
  inviteCode: string;
  myTrips: TripSpace[];
  pendingRequests: TripJoinRequest[];
  isSubmitting: boolean;
  onRequestToJoin: () => Promise<unknown>;
  onViewTrip: (tripId: string) => void;
  onClose: () => void;
}

/**
 * Shown whenever an `inviteCode` is present in the URL. Replaces the old
 * inline "you've been invited" banner so the invite is front-and-center
 * regardless of what else is on the page, and covers the states a banner
 * couldn't: the invite no longer resolving to a trip, and the user already
 * belonging to (or already having requested) the trip it points to.
 */
function JoinTripModal({
  inviteCode,
  myTrips,
  pendingRequests,
  isSubmitting,
  onRequestToJoin,
  onViewTrip,
  onClose,
}: JoinTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  const invite = useTripInvite(inviteCode);

  const membership = invite.tripId
    ? myTrips.find((trip) => trip.id === invite.tripId)
    : undefined;
  const pendingRequest = invite.tripId
    ? pendingRequests.find((request) => request.tripId === invite.tripId)
    : undefined;

  const handleRequestToJoin = async () => {
    setError(null);
    try {
      await onRequestToJoin();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to request access.'));
    }
  };

  const tripName = (
    <span className='text-foreground font-semibold'>
      {invite.title ?? 'this trip'}
    </span>
  );

  let title: string = "You've been invited";
  let body: React.ReactNode;
  let actions: NonNullable<ModalProps['actions']>;

  if (invite.loading) {
    body = <p className='text-muted-foreground text-sm'>Checking invite…</p>;
    actions = [{ label: 'Close', variant: 'secondary', onClick: onClose }];
  } else if (!invite.exists) {
    title = 'Invite not found';
    body = (
      <p className='text-muted-foreground text-sm'>
        This invite link is no longer valid. Ask the trip owner for a new
        one.
      </p>
    );
    actions = [{ label: 'Close', variant: 'secondary', onClick: onClose }];
  } else if (membership) {
    title = "You're already in";
    body = (
      <p className='text-muted-foreground text-sm'>
        You&apos;re already a member of {tripName}.
      </p>
    );
    actions = [
      { label: 'Close', variant: 'secondary', onClick: onClose },
      {
        label: 'View trip',
        onClick: () => onViewTrip(invite.tripId as string),
      },
    ];
  } else if (pendingRequest) {
    title = 'Request sent';
    body = (
      <p className='text-muted-foreground text-sm'>
        Your request to join {tripName} has been sent. An Admin will choose
        your role before you can view it.
      </p>
    );
    actions = [{ label: 'Close', variant: 'secondary', onClick: onClose }];
  } else {
    body = (
      <>
        <p className='text-muted-foreground text-sm'>
          Request access to {tripName}. An Admin will choose your role
          before you can view it.
        </p>
        {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
      </>
    );
    actions = [
      {
        label: 'Cancel',
        variant: 'secondary',
        onClick: onClose,
        disabled: isSubmitting,
      },
      {
        label: isSubmitting ? 'Requesting…' : 'Request to join',
        onClick: handleRequestToJoin,
        loading: isSubmitting,
        disabled: isSubmitting,
      },
    ];
  }

  return (
    <Modal isOpen onClose={onClose} title={title} actions={actions}>
      {body}
    </Modal>
  );
}

export default JoinTripModal;
