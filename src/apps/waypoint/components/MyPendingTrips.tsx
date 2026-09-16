import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';

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
        const snapshot = await getDocs(
          query(
            collection(db, 'apps', 'waypoint', 'inviteCodes'),
            where('tripId', '==', request.tripId),
          ),
        );
        const title = snapshot.docs[0]?.data().title;

        return [
          request.tripId,
          typeof title === 'string' ? title : `Trip ${request.tripId}`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is the request content signal
  }, [requestKey]);

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
              <span className='text-muted-foreground text-sm'>Pending</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default MyPendingTrips;
