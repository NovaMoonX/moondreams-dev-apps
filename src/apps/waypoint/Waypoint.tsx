import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import { createTrip } from '@apps/waypoint/store/actions/tripActions';
import { startTripListener } from '@apps/waypoint/store/listeners/tripListeners';
import { selectTrips } from '@apps/waypoint/store/selectors';
import { setTrips } from '@apps/waypoint/store/slices/tripSlice';

function Waypoint() {
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trips = useAppSelector(selectTrips);
  const tripsLoaded = useAppSelector((state) => state.waypoint.trip.loaded);

  useEffect(() => {
    if (!user?.uid) {
      dispatch(setTrips([]));
      return;
    }

    return startTripListener(user.uid, (nextTrips) => {
      dispatch(setTrips(nextTrips));
    });
  }, [dispatch, user?.uid]);

  const handleCreateTrip = async (values: {
    title: string;
    startDate: number;
    endDate: number;
  }) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(createTrip({ uid: user.uid, ...values })).unwrap();
      setIsCreateModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Waypoint.' />;
  }

  if (!tripsLoaded) {
    return <Loading />;
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <NavButton href='/' variant='link'>
          Back home
        </NavButton>

        <div className='flex items-center justify-between gap-4'>
          <div>
            <h1 className='text-3xl font-semibold'>My Trips</h1>
            <p className='text-muted-foreground mt-1'>
              Create a trip to start planning together.
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            Create trip
          </Button>
        </div>

        {trips.length === 0 ? (
          <div className='border-border rounded-lg border border-dashed p-8 text-center'>
            <p className='text-muted-foreground text-sm'>
              You do not belong to any trips yet.
            </p>
            <Button className='mt-4' onClick={() => setIsCreateModalOpen(true)}>
              Create your first trip
            </Button>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2'>
            {trips.map((trip) => (
              <div
                key={trip.id}
                className='border-border bg-card rounded-lg border p-4'
              >
                <h2 className='text-lg font-semibold'>{trip.title}</h2>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {formatDateTime(trip.startDate)} –{' '}
                  {formatDateTime(trip.endDate)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTripModal
        isOpen={isCreateModalOpen}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateTrip}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}

export default Waypoint;
