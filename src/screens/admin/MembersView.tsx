import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import SearchInput from '@/components/SearchInput';
import useNow from '@/hooks/useNow';
import UserAvatar from '@/ui/UserAvatar';
import { formatDateShort } from '@/utils/formatUtils';
import { getActiveSince } from '@lib/appUsage/appUsage';
import { siteVisitsQueryOptions } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { MEMBER_SEARCH_THRESHOLD } from './constants';
import MemberDetailSheet from './MemberDetailSheet';
import { useAllAppUsage } from './useAllAppUsage';

interface MembersViewProps {
  apps: AppMetadata[];
  users: UserProfile[];
  isUsersLoading: boolean;
  isUsersError: boolean;
  selectedUid: string | null;
  onSelectMember: (uid: string | null) => void;
}

function MembersView({ apps, users, isUsersLoading, isUsersError, selectedUid, onSelectMember }: MembersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const allUsage = useAllAppUsage(apps);
  const visitsQuery = useQuery(siteVisitsQueryOptions());

  const isLoading = isUsersLoading || allUsage.isLoading || visitsQuery.isPending;
  const hasError = isUsersError || allUsage.hasError || visitsQuery.isError;
  const lastVisitByUid = new Map(
    (visitsQuery.data ?? []).map((visit) => [visit.uid, visit.lastVisitedAt]),
  );
  const usageByAppUid = new Map(
    apps.map((app) => [app.id, new Map((allUsage.byAppId[app.id] ?? []).map((entry) => [entry.uid, entry]))]),
  );
  const activeSince = getActiveSince(now);

  const members = users
    .map((profile) => ({
      profile,
      appUsage: apps.flatMap((app) => {
        const entry = usageByAppUid.get(app.id)?.get(profile.uid);
        return entry
          ? [
              {
                appId: app.id,
                appName: app.name,
                startedAt: entry.startedAt,
                lastActiveAt: entry.lastActiveAt,
                isActive: entry.lastActiveAt >= activeSince,
              },
            ]
          : [];
      }),
    }))
    .map((member) => {
      const newestAppOpen = Math.max(0, ...member.appUsage.map((usage) => usage.lastActiveAt));
      const lastVisitedAt = Math.max(lastVisitByUid.get(member.profile.uid) ?? 0, newestAppOpen);
      return { ...member, lastVisitedAt: lastVisitedAt > 0 ? lastVisitedAt : null };
    })
    .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0));

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleMembers = members.filter(
    (member) =>
      normalizedSearch.length === 0 ||
      member.profile.displayName?.toLowerCase().includes(normalizedSearch) ||
      member.profile.email.toLowerCase().includes(normalizedSearch),
  );
  const selectedMember = members.find((member) => member.profile.uid === selectedUid) ?? null;

  const getVisitText = (lastVisitedAt: number | null) => {
    if (lastVisitedAt) return `Visited ${formatDateShort(lastVisitedAt)}`;
    return isLoading || hasError ? '…' : 'Not seen yet';
  };
  const getEmptyText = () => {
    if (users.length > 0) return 'No members match that search.';
    if (isUsersLoading) return 'Loading members…';
    return isUsersError ? "We couldn't load members just now." : 'No one has signed in yet.';
  };
  const getAppsText = (count: number) => {
    if (isLoading) return '…';
    return `${count}${allUsage.hasError ? '+' : ''} ${count === 1 && !allUsage.hasError ? 'app' : 'apps'}`;
  };
  const isCountKnown = !isUsersLoading && !isUsersError;

  return (
    <div className='max-w-3xl space-y-4'>
      <p className='text-muted-foreground text-sm'>
        {isCountKnown ? `${users.length} ${users.length === 1 ? 'member' : 'members'}, most` : 'Most'} recent
        visitors first. Tap someone to see the apps they use. Visits and app opens are counted from when
        tracking began.
      </p>

      {users.length >= MEMBER_SEARCH_THRESHOLD ? (
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder='Search members by name or email'
        />
      ) : null}

      {hasError ? (
        <p role='status' className='text-muted-foreground text-sm'>
          We couldn&apos;t load everything just now, so some visits and apps may be missing.
        </p>
      ) : null}

      {visibleMembers.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{getEmptyText()}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {visibleMembers.map((member) => (
            <li key={member.profile.uid}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto w-full justify-start gap-3 px-0! py-3 text-left font-normal'
                onClick={() => onSelectMember(member.profile.uid)}
              >
                <UserAvatar user={member.profile} size='sm' />
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm'>
                    {member.profile.displayName ?? member.profile.email}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {member.profile.email}
                  </span>
                </span>
                <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                  <span className='block'>{getVisitText(member.lastVisitedAt)}</span>
                  <span className='block'>{getAppsText(member.appUsage.length)}</span>
                </span>
                <ChevronRight className='text-muted-foreground size-4 shrink-0' aria-hidden='true' />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <MemberDetailSheet
        member={selectedMember}
        isLoading={isLoading}
        hasVisitError={visitsQuery.isError}
        hasUsageError={allUsage.hasError}
        onClose={() => onSelectMember(null)}
      />
    </div>
  );
}

export default MembersView;
