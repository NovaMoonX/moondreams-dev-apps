import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQueries } from '@tanstack/react-query';

import { useAppDispatch } from '@/store';
import { formatDateTime, getErrorMessage } from '@/utils';
import type { TripJoinRequest } from '@apps/waypoint/types';
import { cancelJoinRequest } from '@apps/waypoint/store/actions/membershipActions';
import { tripTitleQueryOptions } from '@apps/waypoint/queries/tripTitleQueries';

interface MyPendingTripsProps {
  requests: TripJoinRequest[];
  loading: boolean;
}

function MyPendingTrips({ requests, loading }: MyPendingTripsProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const titleQueries = useQueries({
    queries: requests.map((request) => tripTitleQueryOptions(request.tripId)),
  });
  const tripTitles = Object.fromEntries(
    requests.map((request, index) => [request.tripId, titleQueries[index]?.data ?? null]),
  );

  const handleCancel = async (request: TripJoinRequest) => {
    const confirmed = await confirm({
      title: 'Withdraw request',
      message:
        'Are you sure you want to withdraw this join request? This action cannot be undone.',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    const requestId = `${request.uid}_${request.tripId}`;
    setBusyRequestId(requestId);

    try {
      await dispatch(
        cancelJoinRequest({ uid: request.uid, tripId: request.tripId }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to withdraw request',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setBusyRequestId(null);
    }
  };

  if (!loading && requests.length === 0) {
    return null;
  }

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          Pending requests you&apos;ve sent
        </h2>
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
      ) : (
        <ul className='space-y-3'>
          {requests.map((request) => {
            const requestId = `${request.uid}_${request.tripId}`;

            return (
              <li
                key={requestId}
                className='border-border flex items-center justify-between gap-3 rounded-md border p-3'
              >
                <div>
                  <p className='font-medium'>
                    {tripTitles[request.tripId] ?? `Trip ${request.tripId}`}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    Requested {formatDateTime(request.requestedAt)}
                  </p>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='text-muted-foreground text-sm'>Pending</span>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    disabled={busyRequestId !== null}
                    onClick={() => handleCancel(request)}
                  >
                    Withdraw
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

export default MyPendingTrips;
