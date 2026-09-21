import { Callout } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';

import SharedAlbumLinkCard from '@apps/waypoint/components/SharedAlbumLinkCard';
import TimelineSection from '@apps/waypoint/components/TimelineSection';
import { selectShouldShowAlbumReminder } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';

interface OverviewSectionProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
}

function OverviewSection({
  trip,
  events,
  currentUserId,
}: OverviewSectionProps) {
  const shouldShowReminder = useAppSelector((state) =>
    selectShouldShowAlbumReminder(state, trip.id, currentUserId),
  );

  return (
    <div className='space-y-4'>
      {shouldShowReminder && (
        <Callout
          variant='info'
          title="Add today's photos"
          description={
            trip.sharedAlbumUrl
              ? "The day is nearly over. Add today's photos to the shared album."
              : "The day is nearly over. Add a shared album link so everyone can upload today's photos."
          }
        />
      )}
      <SharedAlbumLinkCard trip={trip} currentUserId={currentUserId} />
      <TimelineSection
        trip={trip}
        events={events}
        currentUserId={currentUserId}
      />
    </div>
  );
}

export default OverviewSection;
