import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import {
  Archive,
  ArchiveRestore,
  Link,
  LoaderCircle,
  Megaphone,
  Pencil,
} from 'lucide-react';

import { useAppDispatch } from '@/store';
import { useNow } from '@/hooks/useNow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import AnnouncementFormModal from '@apps/waypoint/components/AnnouncementFormModal';
import ChecklistSection from '@apps/waypoint/components/ChecklistSection';
import ExpensesSection from '@apps/waypoint/components/ExpensesSection';
import MembersSection from '@apps/waypoint/components/MembersSection';
import OverviewSection from '@apps/waypoint/components/OverviewSection';
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
import StaysSection from '@apps/waypoint/components/StaysSection';
import TimelineSection from '@apps/waypoint/components/TimelineSection';
import TripProgressBar from '@apps/waypoint/components/TripProgressBar';
import { TRIP_SECTION_TABS, type TripSectionTab } from '@apps/waypoint/constants';
import { createAnnouncement } from '@apps/waypoint/store/actions/announcementActions';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin, isTripDateShiftLocked } from '@apps/waypoint/utils/roleGuards';

interface TripDetailPageProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
  onBack: () => void;
  onEdit?: (trip: TripSpace) => void;
  onToggleArchived?: (trip: TripSpace) => void;
}

function TripDetailPage({
  trip,
  events,
  currentUserId,
  onBack,
  onEdit,
  onToggleArchived,
}: TripDetailPageProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isActive = getTripStatus(trip, now) === 'ACTIVE';
  const isValidSectionTab = (value: string | null): value is TripSectionTab =>
    value !== null && TRIP_SECTION_TABS.includes(value as TripSectionTab);
  const tabParam = searchParams.get('tab');
  // An active trip opens with nothing expanded — the live HUD above is the
  // point; a non-active trip keeps the old behavior of opening to Timeline.
  // A valid ?tab= in the URL takes priority over that default, so a shared
  // or refreshed link reopens on the same section.
  const [sectionTab, setSectionTabState] = useState(() =>
    isValidSectionTab(tabParam) ? tabParam : isActive ? '' : 'overview',
  );

  const setSectionTab = (value: string) => {
    setSectionTabState(value);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (isValidSectionTab(value)) {
      nextSearchParams.set('tab', value);
    } else {
      nextSearchParams.delete('tab');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };
  const [dayTab, setDayTab] = useState('all');
  const [isAnnouncementFormOpen, setIsAnnouncementFormOpen] = useState(false);
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);

  const handleViewDay = (dayIndex: number) => {
    setSectionTab('overview');
    setDayTab(String(dayIndex));
  };

  const handlePostAnnouncement = async (
    fields: Omit<Parameters<typeof createAnnouncement>[0], 'uid' | 'trip'>,
  ) => {
    setIsSubmittingAnnouncement(true);
    try {
      await dispatch(createAnnouncement({ uid: currentUserId, trip, ...fields })).unwrap();
      setIsAnnouncementFormOpen(false);
    } catch (announcementError) {
      addToast({
        title: 'Unable to post this announcement',
        description: getErrorMessage(announcementError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleCopyTripLink = async () => {
    const copied = await copyToClipboard(
      `${window.location.origin}/waypoint?trip=${trip.id}`,
    );
    addToast(
      copied
        ? {
            title: 'Trip link copied',
            description: 'Anyone on this trip can use it to jump right in.',
          }
        : {
            title: 'Unable to copy the link',
            description: 'Please try again.',
            type: 'error',
          },
    );
  };

  return (
    <div className='page'>
      <div
        className={join(
          'mx-auto max-w-4xl',
          isActive ? 'space-y-2.5 py-3 sm:space-y-6 sm:py-8' : 'space-y-6 py-8',
        )}
      >
        <Button
          type='button'
          variant='link'
          className={join('px-0', isActive && 'h-auto p-0')}
          onClick={onBack}
        >
          <ChevronLeft /> Back to My Trips
        </Button>
        <div>
          {trip.coverImageUrl && (
            <img
              src={trip.coverImageUrl}
              alt={`${trip.title} cover`}
              className={join(
                'mb-4 w-full rounded-lg object-cover',
                // Kept slim on an active trip — the live status below is the point,
                // and every bit of vertical space matters on a mobile screen.
                isActive ? 'h-20 sm:h-48' : 'h-48',
              )}
            />
          )}
          <div className={join('flex flex-wrap items-start justify-between', isActive ? 'gap-2' : 'gap-3')}>
            <div className='w-full min-w-0 sm:w-auto'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className={join('font-semibold', isActive ? 'text-2xl' : 'text-3xl')}>
                  {trip.title}
                </h1>
                {isActive && (
                  <Badge variant='success' use='status'>
                    Active
                  </Badge>
                )}
                {trip.isArchived && <Badge variant='muted'>Archived</Badge>}
              </div>
              <p className='text-muted-foreground mt-1'>
                {formatDateUTC(trip.startDate)} - {formatDateUTC(trip.endDate)}
              </p>
            </div>
            <div className='flex shrink-0 gap-1.5 sm:gap-2'>
              {onEdit && (
                <>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    aria-label='Edit trip'
                    className='px-2 sm:hidden'
                    onClick={() => onEdit(trip)}
                  >
                    <Pencil className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    aria-label='Edit trip'
                    className='hidden! px-3 sm:inline-flex!'
                    onClick={() => onEdit(trip)}
                  >
                    <span>Edit</span>
                  </Button>
                </>
              )}
              {isTripAdmin(trip, currentUserId) && (
                <>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    aria-label='Post announcement'
                    title='Post announcement'
                    className='px-2 sm:hidden'
                    onClick={() => setIsAnnouncementFormOpen(true)}
                  >
                    <Megaphone className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    aria-label='Post announcement'
                    className='hidden! px-3 sm:inline-flex!'
                    onClick={() => setIsAnnouncementFormOpen(true)}
                  >
                    Announcement
                  </Button>
                </>
              )}
              {onToggleArchived && (
                <>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    aria-label={
                      trip.isArchived ? 'Unarchive trip' : 'Archive trip'
                    }
                    className='px-2 sm:hidden'
                    onClick={() => onToggleArchived(trip)}
                  >
                    {trip.isArchived ? (
                      <ArchiveRestore className='h-4 w-4' />
                    ) : (
                      <Archive className='h-4 w-4' />
                    )}
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    aria-label={
                      trip.isArchived ? 'Unarchive trip' : 'Archive trip'
                    }
                    className='hidden! px-3 sm:inline-flex!'
                    onClick={() => onToggleArchived(trip)}
                  >
                    {trip.isArchived ? 'Unarchive' : 'Archive'}
                  </Button>
                </>
              )}
              <>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  aria-label='Copy trip link'
                  title='Copy trip link'
                  className='px-2 sm:hidden!'
                  onClick={() => void handleCopyTripLink()}
                >
                  <Link className='h-4 w-4' />
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  aria-label='Copy trip link'
                  title='Copy trip link'
                  className='px-2 hidden! sm:inline-flex!'
                  onClick={() => void handleCopyTripLink()}
                >
                  <Link className='h-4 w-4' />
                </Button>
              </>
              {isActive && (
                <span className='sm:hidden'>
                  <SharedAlbumSection trip={trip} currentUserId={currentUserId} variant='icon' />
                </span>
              )}
            </div>
          </div>
          <div className={join('mt-3', isActive && 'hidden sm:block')}>
            <SharedAlbumSection trip={trip} currentUserId={currentUserId} />
          </div>
        </div>
        {isTripDateShiftLocked(trip) && (
          <div className='bg-warning/15 text-warning border-warning flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm'>
            <LoaderCircle className='h-4 w-4 shrink-0 animate-spin' />
            <span>
              This trip&apos;s dates are being updated — editing is paused until
              it finishes. This can take a minute.
            </span>
          </div>
        )}
        <OverviewSection trip={trip} currentUserId={currentUserId} onViewDay={handleViewDay} />
        <hr className='border-border' />
        <Tabs
          value={sectionTab}
          onValueChange={setSectionTab}
          tabsWidth='full'
          variant='pills'
        >
          <TabsList>
            <TabsTrigger value='overview'>Timeline</TabsTrigger>
            <TabsTrigger value='members'>Members</TabsTrigger>
            <TabsTrigger value='expenses'>Expenses</TabsTrigger>
            <TabsTrigger value='stays'>Stays</TabsTrigger>
            <TabsTrigger value='checklist'>Checklist</TabsTrigger>
          </TabsList>
          {sectionTab !== '' && (
            <div className='mt-4 flex justify-center'>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => setSectionTab('')}
              >
                Collapse view
              </Button>
            </div>
          )}
          <TabsContent value='overview' className='pt-2'>
            <TimelineSection
              trip={trip}
              events={events}
              currentUserId={currentUserId}
              activeDayTab={dayTab}
              onActiveDayTabChange={setDayTab}
            />
          </TabsContent>
          <TabsContent value='members'>
            <MembersSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='expenses'>
            <ExpensesSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='stays'>
            <StaysSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='checklist'>
            <ChecklistSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
        </Tabs>
      </div>
      {isActive && <TripProgressBar trip={trip} now={now} />}
      <AnnouncementFormModal
        key={isAnnouncementFormOpen ? 'open' : 'closed'}
        isOpen={isAnnouncementFormOpen}
        isSubmitting={isSubmittingAnnouncement}
        onSubmit={handlePostAnnouncement}
        onClose={() => setIsAnnouncementFormOpen(false)}
      />
    </div>
  );
}

export default TripDetailPage;
