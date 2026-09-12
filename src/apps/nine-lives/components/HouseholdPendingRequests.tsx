import { Avatar, Button } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getInitials } from '@/utils/accountUtils';
import { formatDateTime } from '@/utils/formatUtils';

import {
  approveRequest,
  declineRequest,
} from '../store/actions/pendingRequestsActions';

interface HouseholdPendingRequestsProps {
  householdId: string;
}

function HouseholdPendingRequests({ householdId }: HouseholdPendingRequestsProps) {
  const dispatch = useAppDispatch();
  const requests = useAppSelector((state) =>
    state.nineLives.pendingRequests.items.filter(
      (request) => request.householdId === householdId,
    ),
  );
  const userInfo = useUserInfo(requests.map((request) => request.uid));
  const members = userInfo?.users ?? [];

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
          const initials = member?.photoURL ? undefined : getInitials(displayName);

          return (
            <li
              key={request.uid}
              className='border-border flex items-center justify-between gap-3 rounded-md border p-3'
            >
              <div className='flex items-center gap-3'>
                <Avatar
                  src={member?.photoURL ?? undefined}
                  alt={displayName}
                  title={displayName}
                  initials={initials}
                  size='md'
                  shape='circle'
                />
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
                  onClick={() =>
                    dispatch(
                      approveRequest({ householdId, uid: request.uid }),
                    ).unwrap()
                  }
                >
                  Accept
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() =>
                    dispatch(
                      declineRequest({ householdId, uid: request.uid }),
                    ).unwrap()
                  }
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
