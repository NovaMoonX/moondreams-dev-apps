import { useUserInfo } from '@/hooks/useUserInfo';
import AvatarStack from '@/ui/AvatarStack';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';

interface EventAttendeeAvatarsProps {
  trip: TripSpace;
  events: TimelineEvent[];
  /** Everyone-events add nothing to the picture, so they're skipped unless this is set. */
  includeEveryone?: boolean;
}

function EventAttendeeAvatars({ trip, events, includeEveryone = false }: EventAttendeeAvatarsProps) {
  const memberIds = Object.keys(trip.members);
  const attendeeIds = Array.from(
    new Set(
      events
        .filter((event) => includeEveryone || event.attendeeTargetType !== 'EVERYONE_INCLUDING_FUTURE')
        .flatMap((event) => getEventAttendeeIds(event, memberIds)),
    ),
  );
  const users = useUserInfo(attendeeIds)?.map ?? {};
  const people = attendeeIds.map((uid) => ({
    id: uid,
    name: users[uid]?.displayName?.trim() || users[uid]?.email || 'Trip member',
    photoURL: users[uid]?.photoURL ?? null,
  }));

  if (people.length === 0) {
    return null;
  }

  return <AvatarStack people={people} size='xs' direction='horizontal' />;
}

export default EventAttendeeAvatars;
