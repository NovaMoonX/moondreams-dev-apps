import { useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Toggle,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateTime } from '@/utils/formatUtils';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import EditTripModal from '@apps/waypoint/components/EditTripModal';
import {
  createTrip,
  editTrip,
  setTripArchived,
} from '@apps/waypoint/store/actions/tripActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import { startTripListener } from '@apps/waypoint/store/listeners/tripListeners';
import { selectTrips } from '@apps/waypoint/store/selectors';
import { setTrips } from '@apps/waypoint/store/slices/tripSlice';
import type { TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

function Waypoint() {
  const { user, loading } = useAuth();
  const { confirm } = useActionModal();
  const dispatch = useAppDispatch();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSpace | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleEditTrip = async (values: EditTripValues) => {
    if (!user?.uid || !editingTrip) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(
        editTrip({ uid: user.uid, trip: editingTrip, values }),
      ).unwrap();
      setEditingTrip(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchived = async (trip: TripSpace) => {
    if (!user?.uid) {
      return;
    }

    if (!trip.isArchived) {
      const confirmed = await confirm({
        title: 'Archive trip',
        message:
          'Archive this trip? It will stay available under Show archived and can be restored later.',
      });
      if (!confirmed) {
        return;
      }
    }

    setError(null);
    try {
      await dispatch(
        setTripArchived({
          uid: user.uid,
          trip,
          isArchived: !trip.isArchived,
        }),
      ).unwrap();
    } catch (archiveError) {
      setError(getErrorMessage(archiveError, 'Unable to update this trip.'));
    }
  };

  const visibleTrips = trips.filter(
    (trip) => showArchived || !trip.isArchived,
  );

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
          <div className='flex items-center gap-3'>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Toggle
                size='sm'
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              Show archived
            </label>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              Create trip
            </Button>
          </div>
        </div>

        {visibleTrips.length === 0 ? (
          <div className='border-border rounded-lg border border-dashed p-8 text-center'>
            <p className='text-muted-foreground text-sm'>
              {showArchived
                ? 'You do not have any trips to show.'
                : 'You do not belong to any active trips yet.'}
            </p>
            <Button className='mt-4' onClick={() => setIsCreateModalOpen(true)}>
              Create your first trip
            </Button>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2'>
            {visibleTrips.map((trip) => {
              const canEdit = hasTripRole(trip, user.uid, ['ADMIN', 'EDITOR']);
              const canArchive = hasTripRole(trip, user.uid, 'ADMIN');

              return (
                <div
                  key={trip.id}
                  className='border-border bg-card rounded-lg border p-4'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <h2 className='text-lg font-semibold'>{trip.title}</h2>
                        {trip.isArchived && (
                          <Badge variant='muted'>Archived</Badge>
                        )}
                      </div>
                      <p className='text-muted-foreground mt-2 text-sm'>
                        {formatDateTime(trip.startDate)} –{' '}
                        {formatDateTime(trip.endDate)}
                      </p>
                    </div>
                    <div className='flex shrink-0 gap-2'>
                      {canEdit && (
                        <Button
                          type='button'
                          size='sm'
                          variant='secondary'
                          onClick={() => {
                            setError(null);
                            setEditingTrip(trip);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {canArchive && (
                        <Button
                          type='button'
                          size='sm'
                          variant='secondary'
                          onClick={() => void handleToggleArchived(trip)}
                        >
                          {trip.isArchived ? 'Unarchive' : 'Archive'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>

      <CreateTripModal
        isOpen={isCreateModalOpen}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateTrip}
        onClose={() => setIsCreateModalOpen(false)}
      />
      <EditTripModal
        key={editingTrip?.id ?? 'waypoint-no-edit'}
        isOpen={editingTrip !== null}
        trip={editingTrip}
        isSubmitting={isSubmitting}
        onSubmit={handleEditTrip}
        onClose={() => setEditingTrip(null)}
      />
    </div>
  );
}

export default Waypoint;
