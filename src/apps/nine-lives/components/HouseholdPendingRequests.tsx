import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import { formatDateTime, getErrorMessage } from '@/utils';

import {
  approveRequest,
  declineRequest,
} from '../store/actions/pendingRequestsActions';

interface HouseholdPendingRequestsProps {
  householdId: string;
}

function HouseholdPendingRequests({ householdId }: HouseholdPendingRequestsProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const requests = useAppSelector(
    (state) =>
      state.nineLives.pendingRequests.items.filter(
        (request) => request.householdId === householdId,
      ),
    shallowEqual,
  );
  const userInfo = useUserInfo(requests.map((request) => request.uid));
  const members = userInfo?.users ?? [];

  const handleApprove = async (uid: string) => {
    try {
      await dispatch(approveRequest({ householdId, uid })).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to accept request',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const handleDecline = async (uid: string) => {
    try {
      await dispatch(declineRequest({ householdId, uid })).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to decline request',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  if (requests.length === 0) {
    return null;
  }

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>Pending requests</h2>
        <span className='text-muted-foreground text-sm'>{requests.length}</span>
      </div>

      <ul className='space-y-3'>
        {requests.map((request) => {
          const member = members.find((user) => user.uid === request.uid);
          const displayName =
            member?.displayName?.trim() || member?.email || 'Household request';

          return (
            <li
              key={request.uid}
              className='border-border flex items-center justify-between gap-3 rounded-md border p-3'
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

              <div className='flex gap-2'>
                <Button
                  type='button'
                  size='sm'
                  onClick={() => handleApprove(request.uid)}
                >
                  Accept
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => handleDecline(request.uid)}
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default HouseholdPendingRequests;
