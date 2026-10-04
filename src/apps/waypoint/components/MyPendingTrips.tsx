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
    <section className='border-border bg-card rounded-xl border'>
      <div className='flex items-center justify-between gap-3 px-4 pt-4 pb-2'>
        <h2 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          Waiting on a reply
        </h2>
        {!loading && (
          <span className='bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold'>
            {requests.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className='text-muted-foreground px-4 pb-4 text-sm'>
          Checking on your requests…
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {requests.map((request) => {
            const requestId = `${request.uid}_${request.tripId}`;

            return (
              <li
                key={requestId}
                className='flex items-center gap-3 px-4 py-3'
              >
                <span
                  aria-hidden
                  className='bg-primary/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base'
                >
                  ⏳
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>
                    {tripTitles[request.tripId] ?? 'A trip'}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    Asked {formatDateTime(request.requestedAt)} · an Admin will
                    pick your role
                  </p>
                </div>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  disabled={busyRequestId !== null}
                  onClick={() => handleCancel(request)}
                >
                  Withdraw
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default MyPendingTrips;
