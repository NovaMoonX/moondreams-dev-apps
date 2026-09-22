import { Callout } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';

import SharedAlbumLinkCard from '@apps/waypoint/components/SharedAlbumLinkCard';
import { selectShouldShowAlbumReminder } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface SharedAlbumSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function SharedAlbumSection({ trip, currentUserId }: SharedAlbumSectionProps) {
  const now = useNow();
  const shouldShowReminder = useAppSelector((state) =>
    selectShouldShowAlbumReminder(state, trip.id, currentUserId, now),
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
    </div>
  );
}

export default SharedAlbumSection;
