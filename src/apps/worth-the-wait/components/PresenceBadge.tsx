import { Badge } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { usePresence } from '@/hooks/usePresence';
import UserAvatar, { type UserAvatarData } from '@/ui/UserAvatar';

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
  const partnerPresence = usePresence(partnerUid);
  const presence =
    partnerPresence && !Array.isArray(partnerPresence)
      ? partnerPresence
      : partnerPresence && partnerPresence[0]
        ? partnerPresence[0]
        : null;

  const isPending = showPendingState;
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
        'flex min-w-28 flex-col items-center gap-2 rounded-xl border border-transparent bg-transparent p-2',
        className,
      )}
    >
      <UserAvatar user={user} size='md' />

      <Badge
        use='status'
        variant={statusVariant}
        size='sm'
        className='w-full justify-center'
      >
        {statusText}
      </Badge>
    </div>
  );
}

export default PresenceBadge;
