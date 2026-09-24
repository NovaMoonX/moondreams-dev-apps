import { useState } from 'react';

import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import { Archive, ArchiveRestore, Link, LoaderCircle, Pencil } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { formatDateUTC } from '@/utils/formatUtils';

import ChecklistSection from '@apps/waypoint/components/ChecklistSection';
import ExpensesSection from '@apps/waypoint/components/ExpensesSection';
import MembersSection from '@apps/waypoint/components/MembersSection';
import OverviewSection from '@apps/waypoint/components/OverviewSection';
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
import StaysSection from '@apps/waypoint/components/StaysSection';
import TimelineSection from '@apps/waypoint/components/TimelineSection';
import TripProgressBar from '@apps/waypoint/components/TripProgressBar';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { isTripDateShiftLocked } from '@apps/waypoint/utils/roleGuards';

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
  const { addToast } = useToast();
  const isActive = getTripStatus(trip, now) === 'ACTIVE';
  // An active trip opens with nothing expanded — the live HUD above is the
  // point; a non-active trip keeps the old behavior of opening to Timeline.
  const [sectionTab, setSectionTab] = useState(() => (isActive ? '' : 'overview'));
  const [dayTab, setDayTab] = useState('all');

  const handleViewDay = (dayIndex: number) => {
    setSectionTab('overview');
    setDayTab(String(dayIndex));
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
      <div className='mx-auto max-w-4xl space-y-6 py-8'>
        <Button type='button' variant='link' className='px-0' onClick={onBack}>
          <ChevronLeft /> Back to My Trips
        </Button>
        <div>
          {trip.coverImageUrl && (
            <img
              src={trip.coverImageUrl}
              alt={`${trip.title} cover`}
              className='mb-4 h-48 w-full rounded-lg object-cover'
            />
          )}
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-3xl font-semibold'>{trip.title}</h1>
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
            <div className='flex shrink-0 flex-col gap-1.5 sm:flex-row sm:gap-2'>
              {onEdit && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  aria-label='Edit trip'
                  className='px-2 sm:px-3'
                  onClick={() => onEdit(trip)}
                >
                  <Pencil className='h-4 w-4 sm:hidden' />
                  <span className='hidden sm:inline'>Edit</span>
                </Button>
              )}
              {onToggleArchived && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  aria-label={
                    trip.isArchived ? 'Unarchive trip' : 'Archive trip'
                  }
                  className='px-2 sm:px-3'
                  onClick={() => onToggleArchived(trip)}
                >
                  {trip.isArchived ? (
                    <ArchiveRestore className='h-4 w-4 sm:hidden' />
                  ) : (
                    <Archive className='h-4 w-4 sm:hidden' />
                  )}
                  <span className='hidden sm:inline'>
                    {trip.isArchived ? 'Unarchive' : 'Archive'}
                  </span>
                </Button>
              )}
              <Button
                type='button'
                variant='secondary'
                size='sm'
                aria-label='Copy trip link'
                title='Copy trip link'
                className='px-2'
                onClick={() => void handleCopyTripLink()}
              >
                <Link className='h-4 w-4' />
              </Button>
            </div>
          </div>
          <div className='mt-3'>
            <SharedAlbumSection trip={trip} currentUserId={currentUserId} />
          </div>
        </div>
        {isTripDateShiftLocked(trip) && (
          <div className='bg-warning/15 text-warning border-warning flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm'>
            <LoaderCircle className='h-4 w-4 shrink-0 animate-spin' />
            <span>
              This trip&apos;s dates are being updated — editing is paused until it
              finishes. This can take a minute.
            </span>
          </div>
        )}
        <OverviewSection trip={trip} onViewDay={handleViewDay} />
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
    </div>
  );
}

export default TripDetailPage;
