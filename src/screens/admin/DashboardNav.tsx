import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import AppLogo from '@/components/AppLogo';
import SearchInput from '@/components/SearchInput';
import useNow from '@/hooks/useNow';
import { accessRequestsQueryOptions, isOnAccessList } from '@lib/accessRequests/accessRequests';
import { getActiveSince } from '@lib/appUsage/appUsage';
import type { AppUsage } from '@lib/appUsage/appUsage';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { APP_SEARCH_THRESHOLD } from './constants';
import { getUsageRows } from './usageRows';

interface NavRowProps {
  /** An app's logo, before the title. */
  leading?: ReactNode;
  title: string;
  subtitle: string;
  meta: string[];
  isSelected: boolean;
  isWide: boolean;
  onClick: () => void;
}

function NavRow({ leading = null, title, subtitle, meta, isSelected, isWide, onClick }: NavRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-current={isSelected ? 'page' : undefined}
      className={join(
        'h-auto w-full justify-start gap-3 py-3 text-left font-normal',
        isWide ? 'rounded-xl px-3' : 'px-0!',
        isWide && isSelected && 'bg-muted',
      )}
      onClick={onClick}
    >
      {leading}
      <span className='min-w-0 flex-1'>
        <span className={join('text-foreground block truncate text-sm', isSelected && 'font-semibold')}>{title}</span>
        <span className='text-muted-foreground block truncate text-xs'>{subtitle}</span>
      </span>
      <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
        {meta.map((line) => (
          <span key={line} className='block'>
            {line}
          </span>
        ))}
      </span>
      {isWide ? null : <ChevronRight className='text-muted-foreground size-4 shrink-0' aria-hidden='true' />}
    </Button>
  );
}

interface DashboardNavProps {
  apps: AppMetadata[];
  users: UserProfile[];
  usageByAppId: Record<string, AppUsage[] | undefined>;
  isLoading: boolean;
  isUsersError: boolean;
  failedAppIds: string[];
  selected: string | null;
  unsavedAppIds: string[];
  isWide: boolean;
  onSelectMembers: () => void;
  onSelectFirebase: () => void;
  onSelectApp: (appId: string) => void;
}

function DashboardNav({
  apps,
  users,
  usageByAppId,
  isLoading,
  isUsersError,
  failedAppIds,
  selected,
  unsavedAppIds,
  isWide,
  onSelectMembers,
  onSelectFirebase,
  onSelectApp,
}: DashboardNavProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const activeSince = getActiveSince(now);
  const profilesByUid = useMemo(() => new Map(users.map((profile) => [profile.uid, profile])), [users]);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleApps = apps.filter(
    (app) =>
      normalizedSearch.length === 0 ||
      app.name.toLowerCase().includes(normalizedSearch) ||
      app.id.toLowerCase().includes(normalizedSearch),
  );

  const requestQueries = useQueries({ queries: apps.map((app) => accessRequestsQueryOptions(app.id)) });
  const getOpenRequestCount = (app: AppMetadata) =>
    (requestQueries[apps.indexOf(app)]?.data ?? []).filter(
      (request) => request.dismissedAt === null && !isOnAccessList(app.allowedUsers, request.uid, request.email),
    ).length;

  const getAppMeta = (app: AppMetadata) => {
    if (isLoading) return ['…'];
    if (isUsersError || failedAppIds.includes(app.id)) return ["Couldn't load"];
    const rows = getUsageRows(usageByAppId[app.id], profilesByUid, activeSince);
    const askedCount = getOpenRequestCount(app);
    return [
      `${rows.length} started`,
      `${rows.filter((row) => row.isActive).length} active`,
      ...(askedCount > 0 ? [`${askedCount} asked`] : []),
    ];
  };
  const getAppSubtitle = (app: AppMetadata) => {
    const path = `/${app.path.replace(/^\//, '') || app.id}`;
    return unsavedAppIds.includes(app.id) ? `${path} · unsaved` : path;
  };
  const getMembersSubtitle = () => {
    if (isUsersError) return "Couldn't load";
    if (isLoading) return 'Everyone who has signed in';
    return `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
  };

  return (
    <nav aria-label='Dashboard' className='space-y-4'>
      <div className='divide-border divide-y'>
        <NavRow
          title='Members'
          subtitle={getMembersSubtitle()}
          meta={[]}
          isSelected={selected === 'members'}
          isWide={isWide}
          onClick={onSelectMembers}
        />
        <NavRow
          title='Firebase usage'
          subtitle='Free amounts and estimated cost'
          meta={[]}
          isSelected={selected === 'firebase'}
          isWide={isWide}
          onClick={onSelectFirebase}
        />
      </div>

      <div className='space-y-2'>
        <h2
          className={join(
            'text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase',
            isWide && 'px-3',
          )}
        >
          Apps
        </h2>
        {apps.length >= APP_SEARCH_THRESHOLD ? (
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder='Search apps' />
        ) : null}
        {visibleApps.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {apps.length === 0 ? 'No apps yet.' : 'No apps match that search.'}
          </p>
        ) : (
          <div className='divide-border divide-y'>
            {visibleApps.map((app) => (
              <div key={app.id}>
                <NavRow
                  leading={<AppLogo appId={app.id} />}
                  title={app.name || app.id}
                  subtitle={getAppSubtitle(app)}
                  meta={getAppMeta(app)}
                  isSelected={selected === app.id}
                  isWide={isWide}
                  onClick={() => onSelectApp(app.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export default DashboardNav;
