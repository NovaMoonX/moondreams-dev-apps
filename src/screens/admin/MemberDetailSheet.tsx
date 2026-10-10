import DetailSheet from '@/components/DetailSheet';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';
import type { UserProfile } from '@lib/types/appCatalog';

export interface MemberAppUsage {
  appId: string;
  appName: string;
  startedAt: number;
  lastActiveAt: number;
  isActive: boolean;
}

interface MemberDetailSheetProps {
  member: {
    profile: UserProfile;
    lastVisitedAt: number | null;
    appUsage: MemberAppUsage[];
  } | null;
  isLoading: boolean;
  onClose: () => void;
}

/** One member's visit and the apps they use, so the list itself stays one quiet row per person. */
function MemberDetailSheet({ member, isLoading, onClose }: MemberDetailSheetProps) {
  const getVisitText = (lastVisitedAt: number | null) => {
    if (lastVisitedAt) return `Last visited ${formatDate(lastVisitedAt)}`;
    return isLoading ? 'Loading…' : 'Not seen on the site yet';
  };

  return (
    <DetailSheet
      isOpen={member !== null}
      onClose={onClose}
      title={member?.profile.displayName ?? member?.profile.email ?? 'Member'}
    >
      {member ? (
        <div className='space-y-4'>
          <div className='flex items-center gap-3'>
            <UserAvatar user={member.profile} size='md' />
            <div className='min-w-0'>
              <div className='text-foreground truncate text-sm'>{member.profile.email}</div>
              <div className='text-muted-foreground text-xs'>{getVisitText(member.lastVisitedAt)}</div>
            </div>
          </div>

          {member.appUsage.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {isLoading
                ? 'Loading their apps…'
                : "Hasn't opened an app since tracking began."}
            </p>
          ) : (
            <ul className='divide-border divide-y'>
              {member.appUsage.map((usage) => (
                <li key={usage.appId} className='flex items-center justify-between gap-3 py-2.5'>
                  <span className='text-foreground min-w-0 truncate text-sm'>{usage.appName}</span>
                  <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                    <span className='block'>Started {formatDate(usage.startedAt)}</span>
                    <span className='block'>
                      {usage.isActive ? 'Last active' : 'Quiet since'} {formatDate(usage.lastActiveAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default MemberDetailSheet;
