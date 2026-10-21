import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';

import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import { formatDateTime } from '@/utils/formatUtils';
import {
  firebaseUsageQueryOptions,
  MONITORING_ROLE_MISSING,
  type FirebaseUsageLine,
} from '@lib/admin/firebaseUsageQueries';
import type { AppMetadata } from '@lib/types/appCatalog';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const COUNT_FORMAT = new Intl.NumberFormat('en-US');
const USD_FORMAT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const formatBytes = (bytes: number) => {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(1)} MB`;
};
const formatAmount = (line: FirebaseUsageLine, value: number) =>
  line.unit === 'bytes' ? formatBytes(value) : COUNT_FORMAT.format(Math.round(value));
const formatCost = (usd: number) => (usd >= 0.01 ? USD_FORMAT.format(usd) : usd > 0 ? '< $0.01' : '$0.00');

const PERIOD_WORDS = { day: 'a day', month: 'this month', stock: 'stored' } as const;
const USED_WORDS = { day: 'Latest day', month: 'So far this month', stock: 'Now' } as const;

function UsageRow({ line }: { line: FirebaseUsageLine }) {
  const fraction = line.freeAmount > 0 ? line.used / line.freeAmount : 0;
  const percent = Math.min(100, Math.round(fraction * 100));
  const detail =
    line.daysOver !== null && line.daysOver > 0
      ? `Over the free amount on ${line.daysOver} ${line.daysOver === 1 ? 'day' : 'days'} this month`
      : null;

  return (
    <li className='space-y-1.5 py-3'>
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-foreground min-w-0 text-sm'>{line.label}</span>
        <span
          className={join(
            'shrink-0 text-xs whitespace-nowrap',
            line.isOver ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {line.isOver ? `About ${formatCost(line.projectedCostUsd)} this month` : 'Within the free amount'}
        </span>
      </div>
      <div
        role='progressbar'
        aria-label={`${line.label}: ${percent}% of the free amount`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className='bg-muted h-2 overflow-hidden rounded-full'
      >
        <div
          className={join('h-full rounded-full', line.isOver ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {USED_WORDS[line.period]}: {formatAmount(line, line.used)} of {formatAmount(line, line.freeAmount)}{' '}
        {PERIOD_WORDS[line.period]}
      </p>
      {detail ? <p className='text-muted-foreground text-xs'>{detail}</p> : null}
    </li>
  );
}

interface FirebaseUsageViewProps {
  apps: AppMetadata[];
}

function FirebaseUsageView({ apps }: FirebaseUsageViewProps) {
  const query = useQuery(firebaseUsageQueryOptions());

  if (query.isPending) {
    return <p className='text-muted-foreground text-sm'>Loading usage…</p>;
  }

  if (query.isError || !query.data) {
    const needsRole = query.error instanceof Error && query.error.message.includes(MONITORING_ROLE_MISSING);
    return (
      <p className='text-muted-foreground text-sm'>
        {needsRole
          ? "Google isn't letting the functions read usage yet. In Google Cloud, give the Cloud Functions service account the Monitoring Viewer role, then refresh."
          : "We couldn't load usage just now. Refresh to try again."}
      </p>
    );
  }

  const usage = query.data;
  const products = [...new Set(usage.lines.map((line) => line.product))];
  const overCount = usage.lines.filter((line) => line.isOver).length;
  const appNames = new Map(apps.map((app) => [app.id, app.name || app.id]));

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile
          label='Estimated this month'
          value={formatCost(usage.projectedCostUsd)}
          help={
            <HelpTip title='Estimated this month'>
              The Blaze charge above the free amounts if the rest of the month looks like the days so far.
              It&apos;s an estimate from list prices, not your bill.
            </HelpTip>
          }
        />
        <StatTile label='So far this month' value={formatCost(usage.monthToDateCostUsd)} />
      </div>
      <p className='text-muted-foreground text-xs'>
        {overCount === 0
          ? 'Everything is within the free amounts.'
          : `${overCount} of ${usage.lines.length} limits are over the free amount.`}{' '}
        Spark&apos;s free amounts are also what Blaze gives you before it charges. Updated{' '}
        {formatDateTime(usage.generatedAt)}.
      </p>

      {products.map((product) => (
        <section key={product} className='space-y-1'>
          <SectionDivider label={product} />
          <ul className='divide-border divide-y'>
            {usage.lines
              .filter((line) => line.product === product)
              .map((line) => (
                <UsageRow key={line.id} line={line} />
              ))}
          </ul>
        </section>
      ))}

      <section className='space-y-1'>
        <SectionDivider label='Stored data by app' />
        <p className='text-muted-foreground pb-2 text-xs'>
          Google counts reads, writes and downloads for the whole project, so only stored data can be split
          by app.
          {usage.footprints?.isPartial ? ' Very large collections are counted up to a cap, so these are at least this much.' : ''}
        </p>
        {usage.footprints ? (
          <ul className='divide-border divide-y'>
            {usage.footprints.apps.map((app) => (
              <li key={app.appId} className='flex items-center justify-between gap-3 py-2.5'>
                <span className='text-foreground min-w-0 truncate text-sm'>
                  {appNames.get(app.appId) ?? app.appId}
                </span>
                <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                  <span className='block'>{COUNT_FORMAT.format(app.documents)} documents</span>
                  <span className='block'>{formatBytes(app.storageBytes)} of files</span>
                </span>
              </li>
            ))}
            <li className='flex items-center justify-between gap-3 py-2.5'>
              <span className='text-foreground min-w-0 truncate text-sm'>Shared (profile photos)</span>
              <span className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>
                {formatBytes(usage.footprints.sharedStorageBytes)} of files
              </span>
            </li>
          </ul>
        ) : (
          <p className='text-muted-foreground text-sm'>We couldn&apos;t measure stored data just now.</p>
        )}
      </section>

      <p className='text-muted-foreground text-xs'>Prices last checked {usage.pricingCheckedOn}.</p>
    </div>
  );
}

export default FirebaseUsageView;
