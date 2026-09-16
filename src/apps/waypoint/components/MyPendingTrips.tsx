import { getDoc, doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { db } from '@/lib/firebase/config';
import { formatDateTime } from '@/utils';
import type { TripJoinRequest } from '@apps/waypoint/types';

interface MyPendingTripsProps {
  requests: TripJoinRequest[];
  loading: boolean;
}

function MyPendingTrips({ requests, loading }: MyPendingTripsProps) {
  const [tripTitles, setTripTitles] = useState<Record<string, string>>({});
  const requestKey = requests.map((request) => request.tripId).join(',');

  useEffect(() => {
    if (requests.length === 0) {
      return;
    }

    let isActive = true;

    Promise.all(
      requests.map(async (request) => {
        const snapshot = await getDoc(
          doc(db, 'apps', 'waypoint', 'trips', request.tripId),
        );

        return [
          request.tripId,
          snapshot.exists() && typeof snapshot.data().title === 'string'
            ? snapshot.data().title
            : `Trip ${request.tripId}`,
        ] as const;
      }),
    )
      .then((entries) => {
        if (isActive) {
          setTripTitles(Object.fromEntries(entries));
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [requestKey]);

  if (!loading && requests.length === 0) {
    return null;
  }

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>Pending requests you&apos;ve sent</h2>
        {!loading && (
          <span className='text-muted-foreground text-sm'>{requests.length}</span>
        )}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>Loading pending requests…</p>
      ) : (
        <ul className='space-y-3'>
          {requests.map((request) => (
            <li
              key={`${request.uid}_${request.tripId}`}
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
              <Button type='button' variant='secondary' size='sm' disabled>
                Pending
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default MyPendingTrips;
