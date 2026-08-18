import { Badge } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import UserAvatar, { type UserAvatarData } from '@/ui/UserAvatar';

import { usePresence } from '../hooks/usePresence';

type PresenceBadgeProps = {
  user?: UserAvatarData | null;
  partnerUid?: string | null;
  showPendingState?: boolean;
  className?: string;
};

function PresenceBadge({
  user,
  partnerUid,
  showPendingState = false,
  className,
}: PresenceBadgeProps) {
  const presence = usePresence(partnerUid ?? null);

  const isPending = showPendingState || (!partnerUid && !presence?.isOnline);
  const statusText = isPending
    ? 'Pending approval'
    : presence?.isHere
      ? 'Online in WTW'
      : presence?.isOnline
        ? 'Online elsewhere'
        : 'Offline';

  const statusVariant = isPending
    ? 'warning'
    : presence?.isHere
      ? 'success'
      : presence?.isOnline
        ? 'warning'
        : 'secondary';

  return (
    <div
      className={join(
        'flex min-w-[112px] flex-col items-center gap-2 rounded-xl border border-transparent bg-transparent p-2',
        className,
      )}
    >
      <div className='relative'>
        <UserAvatar user={user} size='md' />
      </div>

      <Badge use='status' variant={statusVariant} size='sm' className='w-full justify-center'>
        {statusText}
      </Badge>
    </div>
  );
}

export default PresenceBadge;
