import { Badge, Clickable } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { usePresence } from '@/hooks/usePresence';
import UserAvatar from '@/ui/UserAvatar';
import { useAuth } from '@hooks/useAuth';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useWorthTheWait } from '../context/worthTheWaitContext';

interface PresenceBadgeProps {
  className?: string;
}

function getPresenceStatus({
  isPending,
  partnerUid,
  presence,
}: {
  isPending: boolean;
  partnerUid: string | null;
  presence: { isHere?: boolean; isOnline?: boolean } | null;
}) {
  if (isPending) {
    return { text: 'Pending approval', variant: 'warning' as const };
  }

  if (!partnerUid) {
    return { text: 'Waiting for partner', variant: 'secondary' as const };
  }

  if (presence?.isHere) {
    return { text: 'Online in WTW', variant: 'success' as const };
  }

  if (presence?.isOnline) {
    return { text: 'Online elsewhere', variant: 'warning' as const };
  }

  return { text: 'Offline', variant: 'muted' as const };
}

function PresenceBadge({ className }: PresenceBadgeProps) {
  const { user } = useAuth();
  const { space, forceOpenPendingApprovalModal } = useWorthTheWait();

  const activePartnerUid =
    user && space
      ? (space.members.find((memberUid) => memberUid !== user.uid) ?? null)
      : null;
  const partnerUid = activePartnerUid ?? space?.pendingMember?.uid ?? null;
  const showPendingState = Boolean(
    space && space.pendingMember && !activePartnerUid,
  );
  const presence = usePresence(partnerUid, 'worth-the-wait');
  const avatarUser = useUserInfo(partnerUid);

  const { text: statusText, variant: statusVariant } = getPresenceStatus({
    isPending: showPendingState,
    partnerUid,
    presence,
  });

  const component = (
    <div
      className={join(
        'flex min-w-28 flex-col items-center gap-2 rounded-xl border border-transparent bg-transparent p-2',
        className,
      )}
    >
      <UserAvatar user={avatarUser} size='md' />

      <Badge
        use='status'
        variant={statusVariant}
        size='sm'
        className='w-full justify-center'
      >
        {statusText}
      </Badge>
      {showPendingState && (
        <span className='text-muted-foreground text-xs'>
          Click to address request
        </span>
      )}
    </div>
  );

  if (showPendingState) {
    return (
      <Clickable
        aria-label='Click to open modal to address pending request'
        onButtonClick={forceOpenPendingApprovalModal}
      >
        {component}
      </Clickable>
    );
  }

  return component;
}

export default PresenceBadge;
