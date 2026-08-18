import { Badge } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { usePresence } from '@/hooks/usePresence';
import UserAvatar from '@/ui/UserAvatar';
import { useAuth } from '@hooks/useAuth';

import { useWorthTheWait } from '../context/worthTheWaitContext';

type PresenceBadgeProps = {
  className?: string;
};

function PresenceBadge({ className }: PresenceBadgeProps) {
  const { user } = useAuth();
  const { space } = useWorthTheWait();

  const activePartnerUid =
    user && space
      ? (space.members.find((memberUid) => memberUid !== user.uid) ?? null)
      : null;
  const partnerUid = activePartnerUid ?? space?.pendingMember?.uid ?? null;
  const showPendingState = Boolean(
    space && space.pendingMember && !activePartnerUid,
  );

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
