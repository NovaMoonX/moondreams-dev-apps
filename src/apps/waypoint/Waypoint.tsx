import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import AppToggle from '@/components/AppToggle';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import JoinWithCodeModal from '@apps/waypoint/components/JoinWithCodeModal';
import JoinTripModal from '@apps/waypoint/components/JoinTripModal';
import MyEmailInvites from '@apps/waypoint/components/MyEmailInvites';
import MyPendingTrips from '@apps/waypoint/components/MyPendingTrips';
import TripCard from '@apps/waypoint/components/TripCard';
import TripDetailPage from '@apps/waypoint/components/TripDetailPage';
import { useWaypointSync } from '@apps/waypoint/hooks/useWaypointSync';
import { useWaypointTheme } from '@apps/waypoint/hooks/useWaypointTheme';
import { requestToJoinTrip } from '@apps/waypoint/store/actions/membershipActions';
import { createTrip } from '@apps/waypoint/store/actions/tripActions';
import {
  getTripStatus,
  selectIsTripDataLoaded,
  selectTrips,
  selectSortedTimelineEvents,
} from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

function Waypoint() {
  useWaypointTheme();
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isJoinCodeModalOpen, setIsJoinCodeModalOpen] = useState(false);
  const [isEnteredCode, setIsEnteredCode] = useState(false);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const trips = useAppSelector(selectTrips);
  const timelineEvents = useAppSelector(selectSortedTimelineEvents);
  const tripsLoaded = useAppSelector((state) => state.waypoint.trip.loaded);
  const pendingRequests = useAppSelector(
    (state) => state.waypoint.pendingRequests.myRequests,
  );
  const pendingRequestsLoaded = useAppSelector(
    (state) => state.waypoint.pendingRequests.myRequestsLoaded,
  );
  const emailInvites = useAppSelector((state) => state.waypoint.emailInvites.mine);
  const now = useNow();
  const inviteCode = searchParams.get('inviteCode')?.trim().toUpperCase() ?? '';
  const selectedTripId = searchParams.get('trip');
  const isTripDataLoaded = useAppSelector((state) =>
    selectedTripId ? selectIsTripDataLoaded(state, selectedTripId) : true,
  );
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;
  const isSelectedTripMissing = Boolean(selectedTripId) && !selectedTrip;
  const isSelectedTripAdmin =
    selectedTrip?.members[user?.uid ?? '']?.role === 'ADMIN';

  useWaypointSync(user?.uid ?? null, {
    tripId: selectedTrip?.id ?? null,
    isTripAdmin: isSelectedTripAdmin,
    email: user?.email ?? null,
  });

  const handleCreateTrip = async (values: {
    title: string;
    startDate: number;
    endDate: number;
    timezone: string;
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

  const setSelectedTripId = (tripId: string | null) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('tab');
    if (tripId) {
      nextSearchParams.set('trip', tripId);
    } else {
      nextSearchParams.delete('trip');
    }
    setSearchParams(nextSearchParams);
  };

  const handleCloseJoinModal = () => {
    setIsEnteredCode(false);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('inviteCode');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleViewInvitedTrip = (tripId: string) => {
    setIsEnteredCode(false);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('inviteCode');
    nextSearchParams.delete('tab');
    nextSearchParams.set('trip', tripId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleInviteCopied = (kind: 'code' | 'link') => {
    addToast(
      kind === 'link'
        ? {
            title: 'Invite link copied',
            description: 'Share the link with someone you want to invite.',
          }
        : {
            title: 'Invite code copied',
            description: 'Send it to someone you want on this trip.',
          },
    );
  };

  const handleSubmitJoinCode = (code: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('inviteCode', code);
    setSearchParams(nextSearchParams);
    setIsEnteredCode(true);
    setIsJoinCodeModalOpen(false);
  };

  const hasArchivedTrips = trips.some((trip) => trip.isArchived);
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
              now={now}
              onOpen={setSelectedTripId}
              onInviteCopied={handleInviteCopied}
            />
          ))}
        </div>
      </section>
    );
  };

  if (selectedTrip && !isTripDataLoaded) {
    return <Loading />;
  }

  if (selectedTrip) {
    return (
      <TripDetailPage
        key={selectedTrip.id}
        trip={selectedTrip}
        events={timelineEvents}
        currentUserId={user.uid}
        onBack={() => setSelectedTripId(null)}
      />
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-3xl font-semibold'>My Trips</h1>
            <p className='text-muted-foreground mt-1'>
              Create a trip to start planning together.
            </p>
          </div>
          <div className='flex flex-col-reverse gap-3 sm:flex-row sm:items-center'>
            {hasArchivedTrips && (
              <label className='text-muted-foreground flex items-center justify-center gap-2 text-sm'>
                <AppToggle
                  size='sm'
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                />
                Show archived
              </label>
            )}
            <div className='grid grid-cols-2 gap-3 sm:flex'>
              <div className='flex gap-2'>
                <Button
                  variant='secondary'
                  className='flex-1 whitespace-nowrap'
                  onClick={() => setIsJoinCodeModalOpen(true)}
                >
                  Join with code
                </Button>
                <MyEmailInvites uid={user.uid} invites={emailInvites} onViewTrip={handleViewInvitedTrip} />
              </div>
              <Button
                className='whitespace-nowrap'
                onClick={() => setIsCreateModalOpen(true)}
              >
                Create trip
              </Button>
            </div>
          </div>
        </div>

        {isSelectedTripMissing && (
          <div className='border-border flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between'>
            <p className='text-muted-foreground text-sm'>
              We couldn't find that trip. It may have been removed, or you might not be a member yet.
            </p>
            <Button size='sm' variant='secondary' onClick={() => setSelectedTripId(null)}>
              Dismiss
            </Button>
          </div>
        )}

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
      </div>

      <CreateTripModal
        isOpen={isCreateModalOpen}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateTrip}
        onClose={() => setIsCreateModalOpen(false)}
      />
      <JoinWithCodeModal
        isOpen={isJoinCodeModalOpen}
        onSubmit={handleSubmitJoinCode}
        onClose={() => setIsJoinCodeModalOpen(false)}
      />
      {inviteCode && (
        <JoinTripModal
          key={inviteCode}
          inviteCode={inviteCode}
          isEnteredCode={isEnteredCode}
          uid={user.uid}
          emailInvites={emailInvites}
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
