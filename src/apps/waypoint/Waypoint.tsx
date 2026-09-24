import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import AppToggle from '@/components/AppToggle';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import EditTripModal from '@apps/waypoint/components/EditTripModal';
import JoinTripModal from '@apps/waypoint/components/JoinTripModal';
import MyPendingTrips from '@apps/waypoint/components/MyPendingTrips';
import TripCard from '@apps/waypoint/components/TripCard';
import TripDetailPage from '@apps/waypoint/components/TripDetailPage';
import { useWaypointSync } from '@apps/waypoint/hooks/useWaypointSync';
import { requestToJoinTrip } from '@apps/waypoint/store/actions/membershipActions';
import {
  createTrip,
  editTrip,
  setTripArchived,
} from '@apps/waypoint/store/actions/tripActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import {
  getTripStatus,
  selectTrips,
  selectTimelineEvents,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

function Waypoint() {
  const { user, loading } = useAuth();
  const { confirm } = useActionModal();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSpace | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const trips = useAppSelector(selectTrips);
  const timelineEvents = useAppSelector(selectTimelineEvents);
  const tripsLoaded = useAppSelector((state) => state.waypoint.trip.loaded);
  const pendingRequests = useAppSelector(
    (state) => state.waypoint.pendingRequests.myRequests,
  );
  const pendingRequestsLoaded = useAppSelector(
    (state) => state.waypoint.pendingRequests.myRequestsLoaded,
  );
  const now = useNow();
  const inviteCode = searchParams.get('inviteCode')?.trim().toUpperCase() ?? '';
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;
  const isSelectedTripAdmin =
    selectedTrip?.members[user?.uid ?? '']?.role === 'ADMIN';

  useWaypointSync(user?.uid ?? null, {
    tripId: selectedTrip?.id ?? null,
    isTripAdmin: isSelectedTripAdmin,
  });

  const handleCreateTrip = async (values: {
    title: string;
    startDate: number;
    endDate: number;
    coverImageFile: File | null;
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

  const handleRequestToJoin = async () => {
    if (!user?.uid || !inviteCode) {
      return;
    }

    setIsInviteSubmitting(true);

    try {
      await dispatch(requestToJoinTrip({ uid: user.uid, inviteCode })).unwrap();
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleCloseJoinModal = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('inviteCode');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleViewInvitedTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    handleCloseJoinModal();
  };

  const handleCopyInviteLink = async (tripInviteCode: string) => {
    await copyToClipboard(
      `${window.location.origin}/waypoint?inviteCode=${tripInviteCode}`,
    );
    addToast({
      title: 'Invite link copied',
      description: 'Share the link with someone you want to invite.',
    });
  };

  const visibleTrips = trips.filter(
    (trip) => showArchived || !trip.isArchived,
  );
  const activeTrips = visibleTrips.filter(
    (trip) => getTripStatus(trip, now) === 'ACTIVE',
  );
  const upcomingTrips = visibleTrips.filter(
    (trip) => getTripStatus(trip, now) === 'UPCOMING',
  );
  const pastTrips = visibleTrips.filter(
    (trip) => getTripStatus(trip, now) === 'PAST',
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

  const renderTripSection = (label: string, sectionTrips: TripSpace[]) => {
    if (sectionTrips.length === 0) {
      return null;
    }

    return (
      <section className='space-y-4'>
        <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
          {label}
        </h2>
        <div className='grid items-start gap-4 sm:grid-cols-2'>
          {sectionTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              currentUserId={user.uid}
              now={now}
              onOpen={setSelectedTripId}
              onEdit={(tripToEdit) => {
                setError(null);
                setEditingTrip(tripToEdit);
              }}
              onToggleArchived={(tripToToggle) =>
                void handleToggleArchived(tripToToggle)
              }
              onCopyInviteLink={(inviteLinkCode) =>
                void handleCopyInviteLink(inviteLinkCode)
              }
            />
          ))}
        </div>
      </section>
    );
  };

  const editTripModal = (
    <EditTripModal
      key={`edit-trip-${editingTrip?.id ?? 'none'}`}
      isOpen={editingTrip !== null}
      trip={editingTrip}
      isSubmitting={isSubmitting}
      onSubmit={handleEditTrip}
      onClose={() => setEditingTrip(null)}
    />
  );

  if (selectedTrip) {
    return (
      <>
        <TripDetailPage
          key={selectedTrip.id}
          trip={selectedTrip}
          events={timelineEvents}
          currentUserId={user.uid}
          onBack={() => setSelectedTripId(null)}
          onEdit={
            hasTripRole(selectedTrip, user.uid, ['ADMIN', 'EDITOR'])
              ? (tripToEdit) => {
                  setError(null);
                  setEditingTrip(tripToEdit);
                }
              : undefined
          }
        />
        {editTripModal}
      </>
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <NavButton href='/' variant='link'>
          <ChevronLeft /> Back home
        </NavButton>

        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-3xl font-semibold'>My Trips</h1>
            <p className='text-muted-foreground mt-1'>
              Create a trip to start planning together.
            </p>
          </div>
          <div className='flex items-center gap-3 justify-center'>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <AppToggle
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

        <MyPendingTrips
          requests={pendingRequests}
          loading={!pendingRequestsLoaded}
        />

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
          <div className='space-y-8'>
            {renderTripSection('Active', activeTrips)}
            {renderTripSection('Upcoming', upcomingTrips)}
            {renderTripSection('Past', pastTrips)}
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
      {editTripModal}
      {inviteCode && (
        <JoinTripModal
          key={inviteCode}
          inviteCode={inviteCode}
          myTrips={trips}
          pendingRequests={pendingRequests}
          isSubmitting={isInviteSubmitting}
          onRequestToJoin={handleRequestToJoin}
          onViewTrip={handleViewInvitedTrip}
          onClose={handleCloseJoinModal}
        />
      )}
    </div>
  );
}

export default Waypoint;
