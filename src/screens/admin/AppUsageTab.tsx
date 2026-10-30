import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import HelpTip from '@/components/HelpTip';
import SearchInput from '@/components/SearchInput';
import { PillGroup } from '@/components/PillGroup';
import StatTile from '@/components/StatTile';
import useNow from '@/hooks/useNow';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';
import { ACTIVE_WINDOW_MONTHS, getActiveSince } from '@lib/appUsage/appUsage';
import { appUsageQueryOptions } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import {
  CARD_CLASS,
  LIST_CARD_CLASS,
  SURFACE_CLASS,
  USAGE_PREVIEW_ROWS,
  USAGE_SEARCH_THRESHOLD,
} from './constants';
import CountedNote from './CountedNote';
import IconTile from './IconTile';
import { getUsageRows } from './usageRows';

type UsageFilter = 'started' | 'active';

interface AppUsageTabProps {
  app: AppMetadata;
  users: UserProfile[];
  isUsersLoading: boolean;
  isUsersError: boolean;
}

function AppUsageTab({
  app,
  users,
  isUsersLoading,
  isUsersError,
}: AppUsageTabProps) {
  const [filter, setFilter] = useState<UsageFilter>('started');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const now = useNow(60_000);
  const usageQuery = useQuery(appUsageQueryOptions(app.id));
  const usage = usageQuery.data;
  const isPending = usageQuery.isPending || isUsersLoading;
  const isError = usageQuery.isError || isUsersError;

  const activeSince = getActiveSince(now);
  const profilesByUid = useMemo(
    () => new Map(users.map((profile) => [profile.uid, profile])),
    [users],
  );
  const rows = getUsageRows(usage, profilesByUid, activeSince);
  const startedRows = [...rows].sort((a, b) => b.startedAt - a.startedAt);
  const activeRows = rows
    .filter((row) => row.isActive)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const filteredRows = filter === 'active' ? activeRows : startedRows;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchingRows = filteredRows.filter(
    (row) =>
      normalizedSearch.length === 0 ||
      row.profile.displayName?.toLowerCase().includes(normalizedSearch) ||
      row.profile.email.toLowerCase().includes(normalizedSearch),
  );
  const hiddenCount = matchingRows.length - USAGE_PREVIEW_ROWS;
  const isCollapsed =
    !isExpanded && normalizedSearch.length === 0 && hiddenCount > 3;
  const visibleRows = isCollapsed
    ? matchingRows.slice(0, USAGE_PREVIEW_ROWS)
    : matchingRows;

  const getEmptyMessage = () => {
    if (isPending) return 'Loading…';
    if (isError) return "We couldn't load usage just now.";
    if (searchTerm.trim().length > 0 && filteredRows.length > 0)
      return 'No members match that search.';
    if (filter === 'active') {
      return `No one we've seen has opened ${app.name} in the past ${ACTIVE_WINDOW_MONTHS} months.`;
    }
    return `No one has been seen in ${app.name} yet. Members appear here the next time they open it.`;
  };
  const getCount = (count: number) => (isPending || isError ? '–' : count);

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile
          className={SURFACE_CLASS}
          label='Started using'
          value={getCount(startedRows.length)}
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Active'
          value={getCount(activeRows.length)}
          help={
            <HelpTip title='Active users'>
              Members who opened {app.name} in the past {ACTIVE_WINDOW_MONTHS}{' '}
              months. Counts only include members we&apos;ve seen open it since
              tracking began.
            </HelpTip>
          }
        />
      </div>

      <section className='space-y-3'>
        <div className='space-y-1'>
          <h3 className='text-foreground text-base font-semibold'>Members</h3>
          <p className='text-muted-foreground text-sm'>
            Who has opened {app.name},{' '}
            {filter === 'active'
              ? 'most recently active first'
              : 'newest first'}
            .
          </p>
        </div>

        <PillGroup<UsageFilter>
          label='Show members'
          isThin
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'started', label: 'Started using' },
            { value: 'active', label: 'Active' },
          ]}
        />

        {rows.length >= USAGE_SEARCH_THRESHOLD ? (
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder='Search members by name or email'
          />
        ) : null}

        {visibleRows.length === 0 ? (
          <div className={`${CARD_CLASS} flex items-center gap-3`}>
            <IconTile>
              <Users className='size-5' />
            </IconTile>
            <p className='text-muted-foreground text-sm'>{getEmptyMessage()}</p>
          </div>
        ) : (
          <ul className={join(LIST_CARD_CLASS, 'px-4')}>
            {visibleRows.map((row) => (
              <li key={row.uid} className='flex items-center gap-3 py-3'>
                <UserAvatar user={row.profile} size='sm' />
                <div className='min-w-0 flex-1'>
                  <div className='text-foreground truncate text-sm font-medium'>
                    {row.profile.displayName ?? row.profile.email}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {row.profile.email}
                  </div>
                </div>
                <div className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                  <div>Started {formatDate(row.startedAt)}</div>
                  <div className='flex items-center justify-end gap-1.5'>
                    <span
                      aria-hidden='true'
                      className={`size-1.5 rounded-full ${row.isActive ? 'bg-success' : 'bg-warning'}`}
                    />
                    {row.isActive ? 'Last active' : 'Quiet since'}{' '}
                    {formatDate(row.lastActiveAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {isCollapsed ? (
          <Button
            type='button'
            variant='secondary'
            className='w-full'
            onClick={() => setIsExpanded(true)}
          >
            Show all {matchingRows.length}
          </Button>
        ) : null}

        <CountedNote>
          Members show up the first time they open {app.name} after tracking
          began, dated from their oldest data there. Anyone who hasn&apos;t been
          back yet isn&apos;t counted.
        </CountedNote>
      </section>
    </div>
  );
}

export default AppUsageTab;
