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

import {
  APP_SEARCH_THRESHOLD,
  CARD_CLASS,
  SURFACE_CLASS,
  WAITING_TEXT_CLASS,
} from './constants';
import IconTile from '@/ui/IconTile';
import { ClaudeMark, GitHubMark } from '@/components/BrandMarks';
import {
  getPartialFailureLine,
  type PipelineEntry,
} from './pipelineUtils';
import { getUsageRows } from './usageRows';

const NEEDS_YOU_PREVIEW = 2;

interface NavRowProps {
  /** An app's logo or a soft icon tile, before the title. */
  leading: ReactNode;
  title: string;
  subtitle: string;
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

interface DashboardNavProps {
  apps: AppMetadata[];
  users: UserProfile[];
  usageByAppId: Record<string, AppUsage[] | undefined>;
  isLoading: boolean;
  isUsersError: boolean;
  isPipelineLoading: boolean;
  sessionsFailed: boolean;
  inboxFailed: boolean;
  failedAppIds: string[];
  selected: string | null;
  unsavedAppIds: string[];
  isWide: boolean;
  pipelineSummary: { waiting: number; working: number };
  waitingEntries: PipelineEntry[];
  onSelectPipeline: () => void;
  onAnswerEntry: (key: string) => void;
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
  isPipelineLoading,
  sessionsFailed,
  inboxFailed,
  failedAppIds,
  selected,
  unsavedAppIds,
  isWide,
  pipelineSummary,
  waitingEntries,
  onSelectPipeline,
  onAnswerEntry,
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
    if (isLoading) return '…';
    if (isUsersError || failedAppIds.includes(app.id)) return "Couldn't load";
    const rows = getUsageRows(usageByAppId[app.id], profilesByUid, activeSince);
    const askedCount = getOpenRequestCount(app);
    return [
      `${rows.length} started`,
      `${rows.filter((row) => row.isActive).length} active`,
      ...(askedCount > 0 ? [`${askedCount} asked`] : []),
    ].join(' · ');
  };
  const getAppSubtitle = (app: AppMetadata) => {
    const meta = getAppMeta(app);
    if (!unsavedAppIds.includes(app.id)) return meta;
    const isMetaUsable =
      !isLoading && !isUsersError && !failedAppIds.includes(app.id);
    return isMetaUsable ? `${meta} · unsaved` : 'Unsaved changes';
  };
  const getMembersSubtitle = () => {
    if (isUsersError) return "Couldn't load";
    if (isLoading) return 'Everyone who has signed in';
    return `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
  };

  const hasPipelineError = sessionsFailed || inboxFailed;
  const isPipelineUnknown =
    (isPipelineLoading || hasPipelineError) && waitingEntries.length === 0;
  const partialLine =
    hasPipelineError && !isPipelineUnknown
      ? getPartialFailureLine(sessionsFailed)
      : null;
  const getPipelineFigure = (value: number) =>
    isPipelineUnknown ? '–' : value;

  const renderNeedsYou = () => {
    if (isPipelineUnknown || waitingEntries.length === 0) {
      const getText = () => {
        if (hasPipelineError) return "Couldn't load the pipeline";
        if (isPipelineLoading) return 'Checking the pipeline…';
        return 'Nothing waiting on you';
      };
      return (
        <div className={join(CARD_CLASS, 'flex items-center gap-3')}>
          <IconTile>
            {isPipelineUnknown ? (
              <Workflow className='size-5' />
            ) : (
              <CheckCircle2 className='size-5' />
            )}
          </IconTile>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>{getText()}</p>
            {partialLine ? (
              <p className='text-muted-foreground text-xs'>{partialLine}</p>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <section className={join(CARD_CLASS, 'space-y-3')}>
        <div className='flex items-center gap-3'>
          <IconTile>
            <BellRing className={join('size-5', WAITING_TEXT_CLASS)} />
          </IconTile>
          <h2 className='text-base font-semibold'>
            Needs you ({waitingEntries.length})
          </h2>
        </div>
        <ul className='divide-border divide-y'>
          {waitingEntries.slice(0, NEEDS_YOU_PREVIEW).map((entry) => (
            <li key={entry.key}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto w-full min-w-0 justify-start gap-3 px-0! py-3 text-left font-normal'
                onClick={() => onAnswerEntry(entry.key)}
              >
                <span className='bg-muted grid size-8 shrink-0 place-items-center rounded-lg'>
                  {entry.isPrOnly ? (
                    <GitHubMark className='size-4' />
                  ) : (
                    <ClaudeMark className='size-4' />
                  )}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-semibold'>
                    {entry.name}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {entry.asks[0] || 'Waiting on you'}
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
        {partialLine ? (
          <p className='text-muted-foreground text-xs'>{partialLine}</p>
        ) : null}
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='text-muted-foreground gap-1'
            onClick={onSelectPipeline}
          >
            See all in Pipeline
            <ChevronRight className='size-4' aria-hidden='true' />
          </Button>
        </div>
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
        subtitle='Sessions and PRs'
        badge={isWide ? pipelineSummary.waiting : 0}
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
        subtitle='Free amounts and cost'
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
        <StatTile
          className={SURFACE_CLASS}
          label='Waiting'
          value={
            <span
              className={join(
                !isPipelineUnknown &&
                  pipelineSummary.waiting > 0 &&
                  WAITING_TEXT_CLASS,
              )}
            >
              {getPipelineFigure(pipelineSummary.waiting)}
            </span>
          }
          onOpen={{
            label: 'Open the Pipeline: waiting',
            onClick: onSelectPipeline,
          }}
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Working'
          value={getPipelineFigure(pipelineSummary.working)}
          onOpen={{
            label: 'Open the Pipeline: working',
            onClick: onSelectPipeline,
          }}
        />
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
