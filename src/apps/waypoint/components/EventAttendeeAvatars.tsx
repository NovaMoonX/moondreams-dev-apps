import { useUserInfo } from '@/hooks/useUserInfo';
import AvatarStack from '@/ui/AvatarStack';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';

const MAX_VISIBLE_AVATARS = 4;

interface EventAttendeeAvatarsProps {
  trip: TripSpace;
  events: TimelineEvent[];
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

  return (
    <div>
      <AvatarStack people={people} size='xs' direction='horizontal' max={MAX_VISIBLE_AVATARS} />
    </div>
  );
}

export default EventAttendeeAvatars;
