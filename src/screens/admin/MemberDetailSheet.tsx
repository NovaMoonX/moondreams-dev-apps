import DetailSheet from '@/components/DetailSheet';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';
import type { UserProfile } from '@lib/types/appCatalog';

import { CARD_CLASS, LIST_CARD_CLASS } from './constants';

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
  hasVisitError: boolean;
  hasUsageError: boolean;
  onClose: () => void;
}

/** One member's visit and the apps they use, so the list itself stays one quiet row per person. */
function MemberDetailSheet({
  member,
  isLoading,
  hasVisitError,
  hasUsageError,
  onClose,
}: MemberDetailSheetProps) {
  const getVisitText = (lastVisitedAt: number | null) => {
    if (lastVisitedAt) return `Last visited ${formatDate(lastVisitedAt)}`;
    if (isLoading) return 'Loading…';
    return hasVisitError
      ? "Couldn't load their last visit"
      : 'Not seen on the site yet';
  };

  const getEmptyAppsText = () => {
    if (isLoading) return 'Loading their apps…';
    return hasUsageError
      ? "Couldn't load their apps."
      : "Hasn't opened an app since tracking began.";
  };

  return (
    <DetailSheet
      isOpen={member !== null}
      onClose={onClose}
      title={member?.profile.displayName ?? member?.profile.email ?? 'Member'}
    >
      {member ? (
        <div className='space-y-6'>
          <div className={`${CARD_CLASS} flex items-center gap-3`}>
            <UserAvatar user={member.profile} size='md' />
            <div className='min-w-0'>
              <div className='text-foreground truncate text-sm font-medium'>
                {member.profile.email}
              </div>
              <div className='text-muted-foreground text-xs'>
                {getVisitText(member.lastVisitedAt)}
              </div>
            </div>
          </div>

          <section className='space-y-3'>
            <div className='flex items-baseline justify-between gap-3'>
              <h3 className='text-foreground text-base font-semibold'>
                Apps they use
              </h3>
              {member.appUsage.length > 0 ? (
                <span className='text-muted-foreground text-xs'>
                  {member.appUsage.length}
                </span>
              ) : null}
            </div>
            {member.appUsage.length === 0 ? (
              <p className={`${CARD_CLASS} text-muted-foreground text-sm`}>
                {getEmptyAppsText()}
              </p>
            ) : (
              <ul className={`${LIST_CARD_CLASS} px-4`}>
                {member.appUsage.map((usage) => (
                  <li
                    key={usage.appId}
                    className='flex items-center justify-between gap-3 py-3'
                  >
                    <span className='text-foreground flex min-w-0 items-center gap-2 text-sm font-medium'>
                      <span
                        aria-hidden='true'
                        className={`size-2 shrink-0 rounded-full ${usage.isActive ? 'bg-success' : 'bg-warning'}`}
                      />
                      <span className='truncate'>{usage.appName}</span>
                    </span>
                    <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                      <span className='block'>
                        Started {formatDate(usage.startedAt)}
                      </span>
                      <span className='block'>
                        {usage.isActive ? 'Last active' : 'Quiet since'}{' '}
                        {formatDate(usage.lastActiveAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </DetailSheet>
  );
}

export default MemberDetailSheet;
