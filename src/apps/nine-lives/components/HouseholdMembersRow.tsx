import { Avatar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useUserInfo } from '@/hooks/useUserInfo';
import { getInitials } from '@/utils/accountUtils';

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
          const displayName = member?.displayName?.trim() || member?.email || 'Household member';
          const initials = member?.photoURL ? undefined : getInitials(displayName);

          return (
            <Avatar
              key={memberId}
              src={member?.photoURL ?? undefined}
              alt={displayName}
              title={displayName}
              initials={initials}
              size='md'
              shape='circle'
              className='ring-background ring-2'
            />
          );
        })
      )}
    </div>
  );
}

export default HouseholdMembersRow;
