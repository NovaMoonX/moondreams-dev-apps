import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import HelpTip from '@/components/HelpTip';
import { PillGroup } from '@/components/PillGroup';
import StatTile from '@/components/StatTile';
import useNow from '@/hooks/useNow';
import UserAvatar from '@/ui/UserAvatar';
import { formatDate } from '@/utils/formatUtils';
import { ACTIVE_WINDOW_MONTHS, getActiveSince } from '@lib/appUsage/appUsage';
import { appUsageQueryOptions } from '@lib/appUsage/appUsageQueries';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

type UsageFilter = 'started' | 'active';

interface AppUsageTabProps {
  app: AppMetadata;
  users: UserProfile[];
}

function AppUsageTab({ app, users }: AppUsageTabProps) {
  const [filter, setFilter] = useState<UsageFilter>('started');
  const now = useNow(60_000);
  const { data: usage, isPending, isError } = useQuery(appUsageQueryOptions(app.id));

  const activeSince = getActiveSince(now);
  const rows = (usage ?? []).flatMap((entry) => {
    const profile = users.find((candidate) => candidate.uid === entry.uid);
    return profile ? [{ ...entry, profile, isActive: entry.lastActiveAt >= activeSince }] : [];
  });
  const startedRows = [...rows].sort((a, b) => b.startedAt - a.startedAt);
  const activeRows = rows
    .filter((row) => row.isActive)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const visibleRows = filter === 'active' ? activeRows : startedRows;

  const getEmptyMessage = () => {
    if (isPending) return 'Loading…';
    if (isError) return "We couldn't load usage just now.";
    if (filter === 'active') {
      return `No one we've seen has opened ${app.name} in the past ${ACTIVE_WINDOW_MONTHS} months.`;
    }
    return `No one has been seen in ${app.name} yet. Members appear here the next time they open it.`;
  };
  const getCount = (count: number) => (isPending || isError ? '–' : count);

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile label='Started using' value={getCount(startedRows.length)} />
        <StatTile
          label='Active'
          value={getCount(activeRows.length)}
          help={
            <HelpTip title='Active users'>
              Members who opened {app.name} in the past {ACTIVE_WINDOW_MONTHS} months. Counts only
              include members we&apos;ve seen open it since tracking began.
            </HelpTip>
          }
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        Members show up the first time they open {app.name} after tracking began, dated from their
        oldest data there. Anyone who hasn&apos;t been back yet isn&apos;t counted.
      </p>

      <PillGroup<UsageFilter>
        label='Show members'
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'started', label: `Started using · ${getCount(startedRows.length)}` },
          { value: 'active', label: `Active · ${getCount(activeRows.length)}` },
        ]}
      />

      {visibleRows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{getEmptyMessage()}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {visibleRows.map((row) => (
            <li key={row.uid} className='flex items-center gap-3 py-2.5'>
              <UserAvatar user={row.profile} size='sm' />
              <div className='min-w-0 flex-1'>
                <div className='text-foreground truncate text-sm'>
                  {row.profile.displayName ?? row.profile.email}
                </div>
                <div className='text-muted-foreground truncate text-xs'>{row.profile.email}</div>
              </div>
              <div className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                <div>Started {formatDate(row.startedAt)}</div>
                <div>
                  {row.isActive ? 'Last active' : 'Quiet since'} {formatDate(row.lastActiveAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AppUsageTab;
