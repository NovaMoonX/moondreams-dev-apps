import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useUserInfo } from '@/hooks/useUserInfo';
import UserAvatar from '@/ui/UserAvatar';

interface HouseholdMembersRowProps {
  memberIds: string[];
  className?: string;
}

function HouseholdMembersRow({ memberIds, className }: HouseholdMembersRowProps) {
  const userInfo = useUserInfo(memberIds);
  const members = userInfo?.users ?? [];

  return (
    <div className={join('flex items-center gap-2', className)}>
      {memberIds.length === 0 ? (
        <span className='text-muted-foreground text-sm'>No members yet</span>
      ) : (
        memberIds.map((memberId) => {
          const member = members.find((user) => user.uid === memberId);

          return (
            <UserAvatar
              key={memberId}
              user={member ?? null}
              size='md'
              className='ring-background ring-2'
            />
          );
        })
      )}
    </div>
  );
}

export default HouseholdMembersRow;
