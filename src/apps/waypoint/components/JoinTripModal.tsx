import { useState } from 'react';

import { Modal } from '@moondreamsdev/dreamer-ui/components';
import type { ModalProps } from '@moondreamsdev/dreamer-ui/components';

import { getErrorMessage } from '@/utils/errorUtils';
import type { TripEmailInvite, TripJoinRequest, TripSpace } from '@apps/waypoint/types';
import EmailInviteJoinModal from '@apps/waypoint/components/EmailInviteJoinModal';
import { useTripInvite } from '@apps/waypoint/hooks/useTripInvite';

interface JoinTripModalProps {
  inviteCode: string;
  isEnteredCode: boolean;
  uid: string;
  /** Invitations addressed to the signed-in email: one for this trip means no request is needed. */
  emailInvites: TripEmailInvite[];
  myTrips: TripSpace[];
  pendingRequests: TripJoinRequest[];
  isSubmitting: boolean;
  onRequestToJoin: () => Promise<unknown>;
  onViewTrip: (tripId: string) => void;
  onClose: () => void;
}

function JoinTripModal({
  inviteCode,
  isEnteredCode,
  uid,
  emailInvites,
  myTrips,
  pendingRequests,
  isSubmitting,
  onRequestToJoin,
  onViewTrip,
  onClose,
}: JoinTripModalProps) {
  const [error, setError] = useState<string | null>(null);
  // Joining uses up the invitation and makes them a member, so remember it to keep showing the welcome.
  const [joinedInvite, setJoinedInvite] = useState<TripEmailInvite | null>(null);
  const invite = useTripInvite(inviteCode);

  const membership = invite.tripId
    ? myTrips.find((trip) => trip.id === invite.tripId)
    : undefined;
  const emailInvite = invite.tripId
    ? emailInvites.find((candidate) => candidate.tripId === invite.tripId)
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
  const closeAction = {
    label: 'Close',
    variant: 'secondary',
    onClick: onClose,
  } as const;

  const getView = (): {
    title: string;
    body: React.ReactNode;
    actions: NonNullable<ModalProps['actions']>;
  } => {
    if (invite.loading) {
      return {
        title: "You've been invited",
        body: <p className='text-muted-foreground text-sm'>Checking invite…</p>,
        actions: [closeAction],
      };
    }

    if (!invite.exists) {
      return {
        title: 'Invite not found',
        body: (
          <p className='text-muted-foreground text-sm'>
            This invite link is no longer valid. Ask the trip owner for a new
            one.
          </p>
        ),
        actions: [closeAction],
      };
    }

    if (membership) {
      return {
        title: "You're already in",
        body: (
          <p className='text-muted-foreground text-sm'>
            You&apos;re already a member of {tripName}.
          </p>
        ),
        actions: [
          closeAction,
          {
            label: 'View trip',
            onClick: () => onViewTrip(membership.id),
          },
        ],
      };
    }

    if (pendingRequest) {
      return {
        title: 'Request sent',
        body: (
          <p className='text-muted-foreground text-sm'>
            Your request to join {tripName} has been sent. An Admin will choose
            your role before you can view it.
          </p>
        ),
        actions: [closeAction],
      };
    }

    return {
      title: isEnteredCode ? 'Found your trip' : "You've been invited",
      body: (
        <>
          <p className='text-muted-foreground text-sm'>
            {isEnteredCode ? (
              <>
                That code belongs to {tripName}. Send a request and an Admin
                will pick your role before you can see it.
              </>
            ) : (
              <>
                Request access to {tripName}. An Admin will choose your role
                before you can view it.
              </>
            )}
          </p>
          {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
        </>
      ),
      actions: [
        { ...closeAction, label: 'Cancel', disabled: isSubmitting },
        {
          label: isSubmitting ? 'Requesting…' : 'Request to join',
          onClick: handleRequestToJoin,
          loading: isSubmitting,
          disabled: isSubmitting,
        },
      ],
    };
  };

  const shownInvite = joinedInvite ?? (membership ? undefined : emailInvite);
  if (shownInvite) {
    return (
      <EmailInviteJoinModal
        invite={shownInvite}
        uid={uid}
        onJoined={() => setJoinedInvite(shownInvite)}
        onViewTrip={onViewTrip}
        onClose={onClose}
      />
    );
  }

  const { title, body, actions } = getView();

  return (
    <Modal isOpen onClose={onClose} title={title} actions={actions}>
      {body}
    </Modal>
  );
}

export default JoinTripModal;
