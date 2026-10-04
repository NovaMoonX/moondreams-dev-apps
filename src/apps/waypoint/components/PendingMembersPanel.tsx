import { useState } from 'react';
import { shallowEqual } from 'react-redux';

import {
  Button,
  Drawer,
  RadioGroup,
  Select,
  Separator,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import { formatDateTime, getErrorMessage } from '@/utils';
import {
  ASSIGNABLE_MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
} from '@apps/waypoint/constants';
import type { TripJoinRequest, UserRole } from '@apps/waypoint/types';
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
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const isSmallScreen = useMediaQuery().isBelow('sm');
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
  const getDisplayName = (uid: string) => {
    const member = members.find((user) => user.uid === uid);
    return member?.displayName?.trim() || member?.email || 'Trip member';
  };
  const activeRequest =
    requests.find(
      (request) => `${request.uid}_${request.tripId}` === activeRequestId,
    ) ?? null;

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
          <span className='bg-secondary text-secondary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold'>
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
        <ul className={join(!isSmallScreen && 'space-y-3')}>
          {requests.map((request) => {
            const member = members.find((user) => user.uid === request.uid);
            const displayName =
              member?.displayName?.trim() || member?.email || 'Trip member';
            const requestId = `${request.uid}_${request.tripId}`;

            if (isSmallScreen) {
              return (
                <li key={requestId}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='h-auto w-full justify-between gap-3 px-0! py-3! text-left'
                    onClick={() => setActiveRequestId(requestId)}
                  >
                    <span className='flex min-w-0 flex-1 items-center gap-3 text-left'>
                      <span className='shrink-0'>
                        <UserAvatar user={member ?? null} size='md' />
                      </span>
                      <span className='min-w-0'>
                        <span className='block truncate font-medium'>
                          {displayName}
                        </span>
                        <span className='text-muted-foreground block text-xs font-normal'>
                          Requested {formatDateTime(request.requestedAt)}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
                  </Button>
                </li>
              );
            }

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

      <Drawer
        isOpen={activeRequest !== null}
        onClose={() => setActiveRequestId(null)}
        title={activeRequest ? getDisplayName(activeRequest.uid) : 'Request'}
        showCloseButton
        footer={
          activeRequest && (
            <div className='flex flex-col gap-2'>
              <Button
                type='button'
                size='lg'
                disabled={busyRequestId !== null}
                onClick={() => handleApprove(activeRequest)}
              >
                Approve
              </Button>
              <Button
                type='button'
                size='lg'
                variant='secondary'
                disabled={busyRequestId !== null}
                onClick={() => handleDecline(activeRequest)}
              >
                Decline
              </Button>
            </div>
          )
        }
      >
        {activeRequest && (
          <div className='space-y-3 pb-2'>
            <p className='text-muted-foreground text-sm'>
              Asked {formatDateTime(activeRequest.requestedAt)}. Pick what they
              can do once they&apos;re in.
            </p>
            <div className='flex justify-center pt-2'>
              <RadioGroup
                value={selectedRoles[activeRequest.uid] ?? 'VIEWER'}
                onChange={(value) =>
                  setSelectedRoles((current) => ({
                    ...current,
                    [activeRequest.uid]: value as UserRole,
                  }))
                }
                options={ROLE_OPTIONS.map((option) => ({
                  label: option.text,
                  value: option.value,
                }))}
              />
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
}

export default PendingMembersPanel;
