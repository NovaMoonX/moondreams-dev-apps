import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Users,
  Workflow,
} from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import AppLogo from '@/components/AppLogo';
import SearchInput from '@/components/SearchInput';
import StatTile from '@/components/StatTile';
import useNow from '@/hooks/useNow';
import {
  accessRequestsQueryOptions,
  isOnAccessList,
} from '@lib/accessRequests/accessRequests';
import { getActiveSince } from '@lib/appUsage/appUsage';
import type { AppUsage } from '@lib/appUsage/appUsage';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { APP_SEARCH_THRESHOLD, CARD_CLASS } from './constants';
import { EntryActions, StatusDot } from './PipelineParts';
import type { PipelineEntry } from './pipelineUtils';
import { getUsageRows } from './usageRows';

interface NavRowProps {
  /** An app's logo or a soft icon tile, before the title. */
  leading: ReactNode;
  title: string;
  subtitle: string;
  meta: string[];
  /** A count that needs the owner, shown as the one solid pill on the row. */
  badge?: number;
  isSelected: boolean;
  isWide: boolean;
  onClick: () => void;
}

function NavRow({
  leading,
  title,
  subtitle,
  meta,
  badge = 0,
  isSelected,
  isWide,
  onClick,
}: NavRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      aria-current={isSelected ? 'page' : undefined}
      className={join(
        'h-auto w-full justify-start gap-3 py-3 text-left font-normal',
        isWide ? 'rounded-xl px-2' : 'px-0!',
        isWide && isSelected && 'bg-muted',
      )}
      onClick={onClick}
    >
      {leading}
      <span className='min-w-0 flex-1'>
        <span
          className={join(
            'text-foreground block truncate text-sm',
            isSelected ? 'font-semibold' : 'font-medium',
          )}
        >
          {title}
        </span>
        <span className='text-muted-foreground block truncate text-xs'>
          {subtitle}
        </span>
      </span>
      {meta.length > 0 ? (
        <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
          {meta.map((line) => (
            <span key={line} className='block'>
              {line}
            </span>
          ))}
        </span>
      ) : null}
      {badge > 0 ? (
        <span className='bg-primary text-primary-foreground min-w-5 shrink-0 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums'>
          {badge}
        </span>
      ) : null}
      {isWide ? null : (
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      )}
    </Button>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span
      className='bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl'
      aria-hidden='true'
    >
      {children}
    </span>
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
  pipelineSummary: { waiting: number; working: number; text: string };
  waitingEntries: PipelineEntry[];
  onSelectPipeline: () => void;
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
  pipelineSummary,
  waitingEntries,
  onSelectPipeline,
  onSelectMembers,
  onSelectFirebase,
  onSelectApp,
}: DashboardNavProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const activeSince = getActiveSince(now);
  const profilesByUid = useMemo(
    () => new Map(users.map((profile) => [profile.uid, profile])),
    [users],
  );
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleApps = apps.filter(
    (app) =>
      normalizedSearch.length === 0 ||
      app.name.toLowerCase().includes(normalizedSearch) ||
      app.id.toLowerCase().includes(normalizedSearch),
  );

  const requestQueries = useQueries({
    queries: apps.map((app) => accessRequestsQueryOptions(app.id)),
  });
  const getOpenRequestCount = (app: AppMetadata) =>
    (requestQueries[apps.indexOf(app)]?.data ?? []).filter(
      (request) =>
        request.dismissedAt === null &&
        !isOnAccessList(app.allowedUsers, request.uid, request.email),
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

  const getActiveAppCount = () =>
    apps.filter((app) =>
      getUsageRows(usageByAppId[app.id], profilesByUid, activeSince).some(
        (row) => row.isActive,
      ),
    ).length;
  const getFigure = (value: number) => (isLoading ? '…' : value);

  const renderNeedsYou = () => {
    if (waitingEntries.length === 0) {
      return (
        <div className={join(CARD_CLASS, 'flex items-center gap-3')}>
          <IconTile>
            <CheckCircle2 className='size-5' />
          </IconTile>
          <p className='text-sm font-medium'>
            {pipelineSummary.text === "Couldn't load"
              ? "Couldn't load the pipeline"
              : 'Nothing waiting on you'}
          </p>
        </div>
      );
    }
    return (
      <section className={join(CARD_CLASS, 'space-y-3')}>
        <div className='flex items-center gap-3'>
          <IconTile>
            <BellRing className='text-primary size-5' />
          </IconTile>
          <h2 className='text-base font-semibold'>
            Needs you ({waitingEntries.length})
          </h2>
        </div>
        <ul className='divide-border divide-y'>
          {waitingEntries.slice(0, 3).map((entry) => (
            <li key={entry.key} className='space-y-3 py-3 first:pt-0'>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto w-full justify-start gap-3 px-0! py-0 text-left font-normal'
                onClick={onSelectPipeline}
              >
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-semibold'>
                    {entry.name}
                  </span>
                  <span className='text-muted-foreground flex items-center gap-2 text-xs'>
                    <StatusDot group='waiting' />
                    <span className='min-w-0 truncate'>{entry.subtitle}</span>
                  </span>
                </span>
              </Button>
              <EntryActions entry={entry} />
            </li>
          ))}
        </ul>
        <Button
          type='button'
          variant='tertiary'
          className='w-full'
          onClick={onSelectPipeline}
        >
          See all in Pipeline
        </Button>
      </section>
    );
  };

  const workspace = (
    <div className='divide-border divide-y'>
      <NavRow
        leading={
          <IconTile>
            <Workflow className='size-5' />
          </IconTile>
        }
        title='Pipeline'
        subtitle={pipelineSummary.text}
        meta={[]}
        badge={pipelineSummary.waiting}
        isSelected={selected === 'pipeline'}
        isWide={isWide}
        onClick={onSelectPipeline}
      />
      <NavRow
        leading={
          <IconTile>
            <Users className='size-5' />
          </IconTile>
        }
        title='Members'
        subtitle={getMembersSubtitle()}
        meta={[]}
        isSelected={selected === 'members'}
        isWide={isWide}
        onClick={onSelectMembers}
      />
      <NavRow
        leading={
          <IconTile>
            <Gauge className='size-5' />
          </IconTile>
        }
        title='Firebase usage'
        subtitle='Free amounts and estimated cost'
        meta={[]}
        isSelected={selected === 'firebase'}
        isWide={isWide}
        onClick={onSelectFirebase}
      />
    </div>
  );

  const appList = (
    <>
      {apps.length >= APP_SEARCH_THRESHOLD ? (
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder='Search apps'
        />
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
              leading={<AppLogo appId={app.id} />}
              title={app.name || app.id}
              subtitle={getAppSubtitle(app)}
              meta={getAppMeta(app)}
              isSelected={selected === app.id}
              isWide={isWide}
              onClick={() => onSelectApp(app.id)}
            />
          ))}
        </div>
      )}
    </>
  );

  const renderTitle = (label: string) => (
    <h2 className={join('text-base font-semibold', isWide ? 'px-2' : 'mb-1')}>
      {label}
    </h2>
  );

  if (isWide) {
    return (
      <nav aria-label='Dashboard' className='space-y-5'>
        <div className='space-y-1'>
          {renderTitle('Workspace')}
          {workspace}
        </div>
        <div className='space-y-2'>
          {renderTitle('Apps')}
          {appList}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label='Dashboard' className='space-y-6'>
      {renderNeedsYou()}
      <div className='grid grid-cols-2 gap-3'>
        <StatTile label='Waiting' value={pipelineSummary.waiting} />
        <StatTile label='Working' value={pipelineSummary.working} />
        <StatTile
          label='Members'
          value={isUsersError ? '–' : getFigure(users.length)}
        />
        <StatTile label='Active apps' value={getFigure(getActiveAppCount())} />
      </div>
      <section className={CARD_CLASS}>
        {renderTitle('Workspace')}
        {workspace}
      </section>
      <section className={join(CARD_CLASS, 'space-y-2')}>
        {renderTitle('Apps')}
        {appList}
      </section>
    </nav>
  );
}

export default DashboardNav;
