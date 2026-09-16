import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';
import NavButton from '@/ui/NavButton';

import CreateTripModal from '@apps/waypoint/components/CreateTripModal';
import MembersSection from '@apps/waypoint/components/MembersSection';
import MyPendingTrips from '@apps/waypoint/components/MyPendingTrips';
import { useMyPendingRequests } from '@apps/waypoint/hooks/useMyPendingRequests';
import { requestToJoinTrip } from '@apps/waypoint/store/actions/membershipActions';
import { createTrip } from '@apps/waypoint/store/actions/tripActions';
import { startTripListener } from '@apps/waypoint/store/listeners/tripListeners';
import { selectTrips } from '@apps/waypoint/store/selectors';
import { setTrips } from '@apps/waypoint/store/slices/tripSlice';

function Waypoint() {
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteRequestSent, setInviteRequestSent] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const trips = useAppSelector(selectTrips);
  const tripsLoaded = useAppSelector((state) => state.waypoint.trip.loaded);
  const { requests: pendingRequests, loading: pendingRequestsLoading } =
    useMyPendingRequests(user?.uid ?? null);
  const inviteCode = searchParams.get('inviteCode')?.trim().toUpperCase() ?? '';
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;

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

  const handleRequestToJoin = async () => {
    if (!user?.uid || !inviteCode) {
      return;
    }

    setIsInviteSubmitting(true);
    setInviteError(null);

    try {
      await dispatch(requestToJoinTrip({ uid: user.uid, inviteCode })).unwrap();
      setInviteRequestSent(true);
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Unable to request access.',
      );
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleCopyInviteLink = async (tripInviteCode: string | null) => {
    if (!tripInviteCode) {
      return;
    }

    await copyToClipboard(
      `${window.location.origin}/waypoint?inviteCode=${tripInviteCode}`,
    );
    addToast({
      title: 'Invite link copied',
      description: 'Share the link with someone you want to invite.',
    });
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
            Back to My Trips
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
              <TabsTrigger value='overview'>Overview</TabsTrigger>
              <TabsTrigger value='members'>Members</TabsTrigger>
            </TabsList>
            <TabsContent value='overview' className='pt-4'>
              <p className='text-muted-foreground text-sm'>
                Your trip planning workspace is ready.
              </p>
            </TabsContent>
            <TabsContent value='members'>
              <MembersSection trip={selectedTrip} currentUserId={user.uid} />
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
          loading={pendingRequestsLoading}
        />

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
                {trip.inviteCode && (
                  <div className='mt-4 flex items-center justify-between gap-3'>
                    <code className='text-muted-foreground text-sm'>
                      Invite: {trip.inviteCode}
                    </code>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      onClick={() => handleCopyInviteLink(trip.inviteCode)}
                    >
                      Copy invite link
                    </Button>
                  </div>
                )}
                <Button
                  type='button'
                  className='mt-4 w-full'
                  onClick={() => setSelectedTripId(trip.id)}
                >
                  Open trip
                </Button>
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
