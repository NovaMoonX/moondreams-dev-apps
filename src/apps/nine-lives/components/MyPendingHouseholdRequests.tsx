import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import { useAppDispatch } from '@/store';
import { formatDateTime, getErrorMessage } from '@/utils';

import { declineRequest } from '../store/actions/pendingRequestsActions';
import type { PendingHouseholdRequest } from '../types';

interface MyPendingHouseholdRequestsProps {
  requests: PendingHouseholdRequest[];
}

function MyPendingHouseholdRequests({ requests }: MyPendingHouseholdRequestsProps) {
  const dispatch = useAppDispatch();
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) {
    return null;
  }

  const handleRemove = async (request: PendingHouseholdRequest) => {
    setRemovingUid(request.householdId);
    setError(null);

    try {
      await dispatch(
        declineRequest({ householdId: request.householdId, uid: request.uid }),
      ).unwrap();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to remove this request.'));
    } finally {
      setRemovingUid(null);
    }
  };

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>Pending requests you've sent</h2>
        <span className='text-muted-foreground text-sm'>{requests.length}</span>
      </div>

      <ul className='space-y-3'>
        {requests.map((request) => (
          <li
            key={request.householdId}
            className='border-border flex items-center justify-between gap-3 rounded-md border p-3'
          >
            <div>
              <p className='font-medium'>
                Invite code{' '}
                <code className='border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-sm'>
                  {request.inviteCode}
                </code>
              </p>
              <p className='text-muted-foreground text-sm'>
                Requested {formatDateTime(request.requestedAt)}
              </p>
            </div>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={removingUid === request.householdId}
              onClick={() => handleRemove(request)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </section>
  );
}

export default MyPendingHouseholdRequests;
