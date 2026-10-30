import { join } from '@moondreamsdev/dreamer-ui/utils';
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

import StatTile from '@/components/StatTile';

import CountedNote from './CountedNote';
import {
  CARD_CLASS,
  LIST_CARD_CLASS,
  MEMBER_SEARCH_THRESHOLD,
  SURFACE_CLASS,
} from './constants';
import MemberDetailSheet from './MemberDetailSheet';
import { useAllAppUsage } from './useAllAppUsage';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface MembersViewProps {
  apps: AppMetadata[];
  users: UserProfile[];
  isUsersLoading: boolean;
  isUsersError: boolean;
  selectedUid: string | null;
  onSelectMember: (uid: string | null) => void;
}

function MembersView({
  apps,
  users,
  isUsersLoading,
  isUsersError,
  selectedUid,
  onSelectMember,
}: MembersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const allUsage = useAllAppUsage(apps);
  const visitsQuery = useQuery(siteVisitsQueryOptions());

  const isLoading =
    isUsersLoading || allUsage.isLoading || visitsQuery.isPending;
  const hasError = isUsersError || allUsage.hasError || visitsQuery.isError;
  const lastVisitByUid = new Map(
    (visitsQuery.data ?? []).map((visit) => [visit.uid, visit.lastVisitedAt]),
  );
  const usageByAppUid = new Map(
    apps.map((app) => [
      app.id,
      new Map(
        (allUsage.byAppId[app.id] ?? []).map((entry) => [entry.uid, entry]),
      ),
    ]),
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
      const newestAppOpen = Math.max(
        0,
        ...member.appUsage.map((usage) => usage.lastActiveAt),
      );
      const lastVisitedAt = Math.max(
        lastVisitByUid.get(member.profile.uid) ?? 0,
        newestAppOpen,
      );
      return {
        ...member,
        lastVisitedAt: lastVisitedAt > 0 ? lastVisitedAt : null,
      };
    })
    .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0));

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleMembers = members.filter(
    (member) =>
      normalizedSearch.length === 0 ||
      member.profile.displayName?.toLowerCase().includes(normalizedSearch) ||
      member.profile.email.toLowerCase().includes(normalizedSearch),
  );
  const selectedMember =
    members.find((member) => member.profile.uid === selectedUid) ?? null;

  const getVisitText = (lastVisitedAt: number | null) => {
    if (lastVisitedAt) return `Visited ${formatDateShort(lastVisitedAt)}`;
    return isLoading || hasError ? '…' : 'Not seen yet';
  };
  const getEmptyText = () => {
    if (users.length > 0) return 'No members match that search.';
    if (isUsersLoading) return 'Loading members…';
    return isUsersError
      ? "We couldn't load members just now."
      : 'No one has signed in yet.';
  };
  const getAppsText = (count: number) => {
    if (isLoading) return '…';
    return `${count}${allUsage.hasError ? '+' : ''} ${count === 1 && !allUsage.hasError ? 'app' : 'apps'}`;
  };
  const isCountKnown = !isUsersLoading && !isUsersError;

  const visitedThisWeek = members.filter(
    (member) =>
      member.lastVisitedAt !== null && member.lastVisitedAt >= now - WEEK_MS,
  ).length;
  const getTileCount = (count: number) =>
    isLoading || hasError || !isCountKnown ? '–' : count;

  return (
    <div className='max-w-3xl space-y-6'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile
          className={SURFACE_CLASS}
          label='Members'
          value={getTileCount(users.length)}
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Visited this week'
          value={getTileCount(visitedThisWeek)}
        />
      </div>

      <section className='space-y-3'>
        <div className='space-y-1'>
          <h2 className='text-foreground text-base font-semibold'>
            Everyone who signed in
          </h2>
          <p className='text-muted-foreground text-sm'>
            Most recent visitors first. Tap someone to see the apps they use.
          </p>
        </div>

        {users.length >= MEMBER_SEARCH_THRESHOLD ? (
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder='Search members by name or email'
          />
        ) : null}

        {hasError ? (
          <p role='status' className='text-muted-foreground text-sm'>
            We couldn&apos;t load everything just now, so some visits and apps
            may be missing.
          </p>
        ) : null}

        {visibleMembers.length === 0 ? (
          <p className={join(CARD_CLASS, 'text-muted-foreground text-sm')}>
            {getEmptyText()}
          </p>
        ) : (
          <ul className={LIST_CARD_CLASS}>
            {visibleMembers.map((member) => (
              <li key={member.profile.uid}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='h-auto min-h-16 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                  onClick={() => onSelectMember(member.profile.uid)}
                >
                  <UserAvatar user={member.profile} size='sm' />
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block truncate text-sm font-medium'>
                      {member.profile.displayName ?? member.profile.email}
                    </span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {member.profile.email}
                    </span>
                  </span>
                  <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                    <span className='block'>
                      {getVisitText(member.lastVisitedAt)}
                    </span>
                    <span className='block'>
                      {getAppsText(member.appUsage.length)}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <CountedNote>
          Visits and app opens are counted from when tracking began, and a
          member&apos;s last visit is their newest site visit or app open.
        </CountedNote>
      </section>

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
