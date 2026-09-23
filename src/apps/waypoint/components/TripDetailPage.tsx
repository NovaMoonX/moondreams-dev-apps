import { useState } from 'react';

import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';

import { useNow } from '@/hooks/useNow';
import { formatDate } from '@/utils/formatUtils';

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

interface TripDetailPageProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
  onBack: () => void;
}

function TripDetailPage({ trip, events, currentUserId, onBack }: TripDetailPageProps) {
  const now = useNow();
  const isActive = getTripStatus(trip, now) === 'ACTIVE';
  // An active trip opens with nothing expanded — the live HUD above is the
  // point; a non-active trip keeps the old behavior of opening to Timeline.
  const [sectionTab, setSectionTab] = useState(() => (isActive ? '' : 'overview'));
  const [dayTab, setDayTab] = useState('all');

  const handleViewDay = (dayIndex: number) => {
    setSectionTab('overview');
    setDayTab(String(dayIndex));
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
          <div className='flex items-center gap-2'>
            <h1 className='text-3xl font-semibold'>{trip.title}</h1>
            {isActive && (
              <Badge variant='success' use='status'>
                Active
              </Badge>
            )}
          </div>
          <p className='text-muted-foreground mt-1'>
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </p>
          <div className='mt-3'>
            <SharedAlbumSection trip={trip} currentUserId={currentUserId} />
          </div>
        </div>
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
    </div>
  );
}

export default TripDetailPage;
