import { useUserInfo } from '@/hooks/useUserInfo';
import UserAvatar from '@/ui/UserAvatar';
import type { TripSpace } from '@apps/waypoint/types';

import PendingMembersPanel from './PendingMembersPanel';

interface MembersSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function MembersSection({ trip, currentUserId }: MembersSectionProps) {
  const memberIds = Object.keys(trip.members);
  const userInfo = useUserInfo(memberIds);
  const members = userInfo?.map ?? {};
  const isAdmin = trip.members[currentUserId]?.role === 'ADMIN';

  return (
    <div className='space-y-6 pt-4'>
      <section className='space-y-3'>
        <h2 className='text-xl font-semibold'>Members</h2>
        <ul className='divide-border divide-y'>
          {memberIds.map((memberId) => {
            const member = members[memberId];
            const displayName =
              member?.displayName?.trim() || member?.email || 'Trip member';

            return (
              <li key={memberId} className='flex items-center justify-between gap-3 py-3'>
                <div className='flex items-center gap-3'>
                  <UserAvatar user={member ?? null} size='md' />
                  <span className='font-medium'>{displayName}</span>
                </div>
                <span className='text-muted-foreground text-sm'>
                  {trip.members[memberId].role}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {isAdmin && <PendingMembersPanel tripId={trip.id} />}
    </div>
  );
}

export default MembersSection;
