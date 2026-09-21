import { useState } from 'react';
import { shallowEqual } from 'react-redux';

import { Button, Select, Separator } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import { formatDateTime, getErrorMessage } from '@/utils';
import {
  ASSIGNABLE_MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  type TripJoinRequest,
  type UserRole,
} from '@apps/waypoint/types';
import {
  approveJoinRequest,
  declineJoinRequest,
} from '@apps/waypoint/store/actions/membershipActions';

interface PendingMembersPanelProps {
  tripId: string;
}

const ROLE_OPTIONS = ASSIGNABLE_MEMBER_ROLES.map((role) => ({
  text: MEMBER_ROLE_LABELS[role],
  value: role,
}));

function PendingMembersPanel({ tripId }: PendingMembersPanelProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>(
    {},
  );
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const requests = useAppSelector(
    (state) =>
      state.waypoint.pendingRequests.tripRequests.filter(
        (request) => request.tripId === tripId,
      ),
    shallowEqual,
  );
  const loading = useAppSelector(
    (state) => !state.waypoint.pendingRequests.tripRequestsLoaded,
  );
  const userInfo = useUserInfo(requests.map((request) => request.uid));
  const members = userInfo?.users ?? [];

  const handleApprove = async (request: TripJoinRequest) => {
    const requestId = `${request.uid}_${request.tripId}`;
    setBusyRequestId(requestId);

    try {
      await dispatch(
        approveJoinRequest({
          tripId: request.tripId,
          uid: request.uid,
          role: selectedRoles[request.uid] ?? 'VIEWER',
        }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to approve request',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleDecline = async (request: TripJoinRequest) => {
    const confirmed = await confirm({
      title: 'Decline request',
      message:
        'Are you sure you want to decline this join request? This action cannot be undone.',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    const requestId = `${request.uid}_${request.tripId}`;
    setBusyRequestId(requestId);

    try {
      await dispatch(
        declineJoinRequest({ tripId: request.tripId, uid: request.uid }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to decline request',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-lg font-semibold'>Pending requests</h3>
        {!loading && (
          <span className='text-muted-foreground text-sm'>
            {requests.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>
          Loading pending requests…
        </p>
      ) : requests.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No one is waiting to join this trip.
        </p>
      ) : (
        <ul className='space-y-3'>
          {requests.map((request) => {
            const member = members.find((user) => user.uid === request.uid);
            const displayName =
              member?.displayName?.trim() || member?.email || 'Trip member';
            const requestId = `${request.uid}_${request.tripId}`;

            return (
              <li
                key={requestId}
                className='border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'
              >
                <div className='flex items-center gap-3'>
                  <UserAvatar user={member ?? null} size='md' />
                  <div>
                    <p className='font-medium'>{displayName}</p>
                    <p className='text-muted-foreground text-sm'>
                      Requested {formatDateTime(request.requestedAt)}
                    </p>
                  </div>
                </div>
                <div className='flex flex-wrap items-center justify-end gap-2'>
                  <Select
                    size='sm'
                    options={ROLE_OPTIONS}
                    value={selectedRoles[request.uid] ?? 'VIEWER'}
                    onChange={(value) =>
                      setSelectedRoles((current) => ({
                        ...current,
                        [request.uid]: value as UserRole,
                      }))
                    }
                    aria-label={`Role for ${displayName}`}
                    className='mr-2'
                  />
                  <Button
                    type='button'
                    variant='link'
                    disabled={busyRequestId !== null}
                    onClick={() => handleApprove(request)}
                  >
                    Approve
                  </Button>
                  <Separator orientation='vertical' thickness='medium' />
                  <Button
                    type='button'
                    variant='link'
                    disabled={busyRequestId !== null}
                    onClick={() => handleDecline(request)}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default PendingMembersPanel;
