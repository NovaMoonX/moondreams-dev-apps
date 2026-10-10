import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import SearchInput from '@/components/SearchInput';
import useNow from '@/hooks/useNow';
import UserAvatar from '@/ui/UserAvatar';
import { formatDateShort } from '@/utils/formatUtils';
import { getActiveSince } from '@lib/appUsage/appUsage';
import { appUsageQueryOptions, siteVisitsQueryOptions } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { MEMBER_SEARCH_THRESHOLD } from './constants';
import MemberDetailSheet from './MemberDetailSheet';

interface MembersTabProps {
  apps: AppMetadata[];
  users: UserProfile[];
  isUsersLoading: boolean;
}

function MembersTab({ apps, users, isUsersLoading }: MembersTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const now = useNow(60_000);
  const usageQueries = useQueries({ queries: apps.map((app) => appUsageQueryOptions(app.id)) });
  const visitsQuery = useQuery(siteVisitsQueryOptions());

  const sources = [...usageQueries, visitsQuery];
  const isLoading = isUsersLoading || sources.some((source) => source.isPending);
  const hasError = sources.some((source) => source.isError);
  const lastVisitByUid = new Map(
    (visitsQuery.data ?? []).map((visit) => [visit.uid, visit.lastVisitedAt]),
  );
  const activeSince = getActiveSince(now);

  const members = users
    .map((profile) => ({
      profile,
      lastVisitedAt: lastVisitByUid.get(profile.uid) ?? null,
      appUsage: apps.flatMap((app, index) => {
        const entry = usageQueries[index]?.data?.find((usage) => usage.uid === profile.uid);
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
    return isUsersLoading ? 'Loading members…' : 'No one has signed in yet.';
  };
  const getAppsText = (count: number) => {
    if (isLoading || hasError) return '…';
    return `${count} ${count === 1 ? 'app' : 'apps'}`;
  };

  return (
    <div className='max-w-3xl space-y-4'>
      <p className='text-muted-foreground text-sm'>
        {users.length} {users.length === 1 ? 'member' : 'members'}, most recent visitors first. Tap
        someone to see the apps they use. Visits and app opens are counted from when tracking began.
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
                onClick={() => setSelectedUid(member.profile.uid)}
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
        onClose={() => setSelectedUid(null)}
      />
    </div>
  );
}

export default MembersTab;
