import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';
import AppToggle from '@/components/AppToggle';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import EditTripModal from '@apps/waypoint/components/EditTripModal';
import MembersSection from '@apps/waypoint/components/MembersSection';
import ExpensesSection from '@apps/waypoint/components/ExpensesSection';
import TimelineSection from '@apps/waypoint/components/TimelineSection';
import ChecklistSection from '@apps/waypoint/components/ChecklistSection';
import StaysSection from '@apps/waypoint/components/StaysSection';
import MyPendingTrips from '@apps/waypoint/components/MyPendingTrips';
import TripCard from '@apps/waypoint/components/TripCard';
import { useWaypointSync } from '@apps/waypoint/hooks/useWaypointSync';
import { requestToJoinTrip } from '@apps/waypoint/store/actions/membershipActions';
import {
  createTrip,
  editTrip,
  setTripArchived,
} from '@apps/waypoint/store/actions/tripActions';
import type { EditTripValues } from '@apps/waypoint/store/actions/tripActions';
import { selectTrips, selectTimelineEvents } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

function Waypoint() {
  const { user, loading } = useAuth();
  const { confirm } = useActionModal();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSpace | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteRequestSent, setInviteRequestSent] = useState(false);
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
    setInviteError(null);

    try {
      await dispatch(requestToJoinTrip({ uid: user.uid, inviteCode })).unwrap();
      setInviteRequestSent(true);
    } catch (requestError) {
      setInviteError(getErrorMessage(requestError, 'Unable to request access.'));
    } finally {
      setIsInviteSubmitting(false);
    }
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

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Waypoint.' />;
  }

  if (!tripsLoaded) {
    return <Loading />;
  }

  if (selectedTrip) {
    return (
      <div className='page'>
        <div className='mx-auto max-w-4xl space-y-6 py-8'>
          <Button
            type='button'
            variant='link'
            className='px-0'
            onClick={() => setSelectedTripId(null)}
          >
            <ChevronLeft /> Back to My Trips
          </Button>
          <div>
            <h1 className='text-3xl font-semibold'>{selectedTrip.title}</h1>
            <p className='text-muted-foreground mt-1'>
              {formatDateTime(selectedTrip.startDate)} –{' '}
              {formatDateTime(selectedTrip.endDate)}
            </p>
          </div>
          <Tabs defaultValue='overview' tabsWidth='full' variant='pills'>
            <TabsList>
              <TabsTrigger value='overview'>Timeline</TabsTrigger>
              <TabsTrigger value='members'>Members</TabsTrigger>
              <TabsTrigger value='expenses'>Expenses</TabsTrigger>
              <TabsTrigger value='stays'>Stays</TabsTrigger>
              <TabsTrigger value='checklist'>Checklist</TabsTrigger>
            </TabsList>
            <TabsContent value='overview' className='pt-4'>
              <TimelineSection
                trip={selectedTrip}
                events={timelineEvents}
                currentUserId={user.uid}
              />
            </TabsContent>
            <TabsContent value='members'>
              <MembersSection trip={selectedTrip} currentUserId={user.uid} />
            </TabsContent>
            <TabsContent value='expenses'>
              <ExpensesSection trip={selectedTrip} currentUserId={user.uid} />
            </TabsContent>
            <TabsContent value='stays'>
              <StaysSection trip={selectedTrip} currentUserId={user.uid} />
            </TabsContent>
            <TabsContent value='checklist'>
              <ChecklistSection trip={selectedTrip} currentUserId={user.uid} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <NavButton href='/' variant='link'>
          <ChevronLeft /> Back home
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

        {inviteCode && (
          <section className='border-border bg-card rounded-lg border p-4'>
            <h2 className='text-lg font-semibold'>You&apos;ve been invited</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              Request access to this Waypoint trip. An Admin will choose your
              role before you can view it.
            </p>
            {inviteRequestSent ? (
              <p className='text-muted-foreground mt-4 text-sm'>
                Your request has been sent. You&apos;ll see it below while you
                wait.
              </p>
            ) : (
              <Button
                type='button'
                className='mt-4'
                disabled={isInviteSubmitting}
                onClick={handleRequestToJoin}
              >
                {isInviteSubmitting ? 'Requesting…' : 'Request to join'}
              </Button>
            )}
            {inviteError && (
              <p className='text-destructive mt-3 text-sm'>{inviteError}</p>
            )}
          </section>
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
          <div className='grid gap-4 sm:grid-cols-2'>
            {visibleTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                currentUserId={user.uid}
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
