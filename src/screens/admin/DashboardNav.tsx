import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import SearchInput from '@/components/SearchInput';
import useNow from '@/hooks/useNow';
import { getActiveSince } from '@lib/appUsage/appUsage';
import type { AppUsage } from '@lib/appUsage/appUsage';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { APP_SEARCH_THRESHOLD } from './constants';
import { getUsageRows } from './usageRows';

interface NavRowProps {
  title: string;
  subtitle: string;
  meta: string[];
  isSelected: boolean;
  isWide: boolean;
  onClick: () => void;
}

function NavRow({ title, subtitle, meta, isSelected, isWide, onClick }: NavRowProps) {
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
  /** `'members'`, an app id, or null when nothing is open (the phone's list). */
  selected: string | null;
  unsavedAppIds: string[];
  isWide: boolean;
  onSelectMembers: () => void;
  onSelectApp: (appId: string) => void;
}

/** The dashboard's list of places to go: the left panel from `lg` up, and the whole screen on a phone. */
function DashboardNav({
  apps,
  users,
  usageByAppId,
  isLoading,
  selected,
  unsavedAppIds,
  isWide,
  onSelectMembers,
  onSelectApp,
}: DashboardNavProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const activeSince = getActiveSince(now);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleApps = apps.filter(
    (app) =>
      normalizedSearch.length === 0 ||
      app.name.toLowerCase().includes(normalizedSearch) ||
      app.id.toLowerCase().includes(normalizedSearch),
  );

  const getAppMeta = (app: AppMetadata) => {
    const unsaved = unsavedAppIds.includes(app.id) ? ['unsaved changes'] : [];
    if (isLoading) return ['…', ...unsaved];
    const rows = getUsageRows(usageByAppId[app.id], users, activeSince);
    return [`${rows.length} started`, `${rows.filter((row) => row.isActive).length} active`, ...unsaved];
  };

  return (
    <nav aria-label='Dashboard' className='space-y-4'>
      <div className='divide-border divide-y'>
        <NavRow
          title='Members'
          subtitle={isLoading ? 'Everyone who has signed in' : `${users.length} ${users.length === 1 ? 'person' : 'people'}`}
          meta={[]}
          isSelected={selected === 'members'}
          isWide={isWide}
          onClick={onSelectMembers}
        />
      </div>

      <div className='space-y-2'>
        <h2 className='text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase'>Apps</h2>
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
              <NavRow
                key={app.id}
                title={app.name || app.id}
                subtitle={`/${app.path.replace(/^\//, '') || app.id}`}
                meta={getAppMeta(app)}
                isSelected={selected === app.id}
                isWide={isWide}
                onClick={() => onSelectApp(app.id)}
              />
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export default DashboardNav;
