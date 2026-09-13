import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import { formatDateTime, getErrorMessage } from '@/utils';

import type { PendingSpaceRequest } from '../types';

interface MySpacePendingRequestsProps {
  requests: PendingSpaceRequest[];
  onCancel: () => Promise<void>;
}

function MySpacePendingRequests({ requests, onCancel }: MySpacePendingRequestsProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) {
    return null;
  }

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);

    try {
      await onCancel();
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Unable to remove this request.'));
    } finally {
      setRemoving(false);
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
            key={request.spaceId}
            className='border-border flex items-center justify-between gap-3 rounded-md border p-3'
          >
            <p className='text-muted-foreground text-sm'>
              Requested {formatDateTime(request.requestedAt)}
            </p>
            <Button type='button' variant='secondary' size='sm' disabled={removing} onClick={handleRemove}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </section>
  );
}

export default MySpacePendingRequests;
