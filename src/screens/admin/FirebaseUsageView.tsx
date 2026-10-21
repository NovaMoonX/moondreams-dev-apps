import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import Doughnut from '@/components/Doughnut';
import { DOUGHNUT_SLOT_CLASSES, DOUGHNUT_SLOT_FILL_CLASSES } from '@/components/doughnutPalette';
import HelpTip from '@/components/HelpTip';
import { PillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import { formatDateTime } from '@/utils/formatUtils';
import {
  firebaseUsageQueryOptions,
  MONITORING_ROLE_MISSING,
  type FirebaseFootprints,
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

const PERIOD_WORDS = { day: 'a day (UTC)', month: 'this month', stock: 'stored' } as const;
const USED_WORDS = { day: 'Today so far', month: 'So far this month', stock: 'Stored now' } as const;

/** Over now, on pace to go over by month end, or inside the free amount. */
const getStatus = (line: FirebaseUsageLine) => {
  if (line.isOver) return 'over';
  if (line.projectedCostUsd > 0) return 'on-pace';
  return 'within';
};

function UsageRow({ line }: { line: FirebaseUsageLine }) {
  const hasFreeAmount = line.freeAmount > 0;
  const fraction = hasFreeAmount ? line.used / line.freeAmount : 0;
  const ringPercent = hasFreeAmount ? `${Math.round(fraction * 100)}%` : '–';
  const status = getStatus(line);
  const overBy = line.period === 'day' ? 0 : Math.max(0, line.used - line.freeAmount);
  const detail = [
    line.daysOver !== null && line.daysOver > 0
      ? `Over the free amount on ${line.daysOver} ${line.daysOver === 1 ? 'day' : 'days'} this month`
      : null,
    overBy > 0 ? `Over by ${formatAmount(line, overBy)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const getStatusText = () => {
    if (status === 'over') return `About ${formatCost(line.projectedCostUsd)} this month`;
    if (status === 'on-pace') return `On pace for about ${formatCost(line.projectedCostUsd)}`;
    return 'Within the free amount';
  };

  return (
    <li className='flex items-center gap-3 py-3'>
      <Doughnut
        size={56}
        ariaLabel={`${line.label}: ${ringPercent} of the free amount`}
        isDecorative
        segments={[
          {
            id: line.id,
            label: line.label,
            value: hasFreeAmount ? Math.min(line.used, line.freeAmount) : line.used,
            valueText: `${formatAmount(line, line.used)} of ${formatAmount(line, line.freeAmount)}`,
            className: status === 'within' ? 'stroke-primary' : 'stroke-warning',
          },
        ]}
        total={hasFreeAmount ? line.freeAmount : line.used}
        center={<span className='text-foreground text-[11px] leading-none font-medium'>{ringPercent}</span>}
      />
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
          <span className='text-foreground text-sm whitespace-nowrap'>{line.label}</span>
          <span className='text-muted-foreground text-xs'>{getStatusText()}</span>
        </div>
        <p className='text-muted-foreground text-xs'>
          {USED_WORDS[line.period]}: {formatAmount(line, line.used)} of {formatAmount(line, line.freeAmount)}{' '}
          {PERIOD_WORDS[line.period]}
        </p>
        {detail ? <p className='text-foreground text-xs'>{detail}</p> : null}
      </div>
    </li>
  );
}

type ShareMetric = 'documents' | 'files';

interface AppShareProps {
  footprints: FirebaseFootprints;
  appNames: Map<string, string>;
}

/** Stored data split by app: always a whole circle, since the parts are shares of the same total. */
function AppShare({ footprints, appNames }: AppShareProps) {
  const [metric, setMetric] = useState<ShareMetric>('documents');
  const isFiles = metric === 'files';
  const rows = [
    ...footprints.apps.map((app) => ({
      id: app.appId,
      label: appNames.get(app.appId) ?? app.appId,
      value: isFiles ? app.storageBytes : app.documents,
    })),
    ...(isFiles ? [{ id: 'shared', label: 'Shared (profile photos)', value: footprints.sharedStorageBytes }] : []),
  ]
    .map((row, index) => ({ ...row, slot: index % DOUGHNUT_SLOT_CLASSES.length }))
    .sort((a, b) => (a.id === 'shared' ? 1 : b.id === 'shared' ? -1 : b.value - a.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const formatValue = (value: number) => (isFiles ? formatBytes(value) : `${COUNT_FORMAT.format(value)} documents`);
  const percentOf = (value: number) => {
    if (total === 0) return '–';
    if (value > 0 && value / total < 0.01) return '<1%';
    return `${Math.round((value / total) * 100)}%`;
  };
  const formatRowValue = (value: number) => (isFiles ? formatBytes(value) : COUNT_FORMAT.format(value));

  return (
    <div className='space-y-3'>
      <PillGroup<ShareMetric>
        label='Split by'
        value={metric}
        onChange={setMetric}
        isThin
        options={[
          { value: 'documents', label: 'Documents' },
          { value: 'files', label: 'Files' },
        ]}
      />
      {total === 0 ? (
        <p className='text-muted-foreground text-sm'>Nothing stored yet.</p>
      ) : (
        <div className='flex justify-center'>
          <Doughnut
            size={168}
            ariaLabel={`${isFiles ? 'Files' : 'Documents'} stored, split by app`}
            segments={rows.map((row) => ({
              id: row.id,
              label: row.label,
              value: row.value,
              valueText: `${formatValue(row.value)} (${percentOf(row.value)})`,
              className: DOUGHNUT_SLOT_CLASSES[row.slot],
            }))}
            center={
              <>
                <span className='text-foreground text-lg leading-tight font-semibold'>
                  {isFiles ? formatBytes(total) : COUNT_FORMAT.format(total)}
                </span>
                <span className='text-muted-foreground text-xs'>{isFiles ? 'of files' : 'documents'}</span>
              </>
            }
          />
        </div>
      )}
      <ul aria-label={`${isFiles ? 'Files' : 'Documents'} by app`} className='divide-border divide-y'>
        {rows.map((row) => (
          <li key={row.id} className='flex items-center gap-3 py-2.5'>
            <span aria-hidden='true' className={join('size-3 shrink-0 rounded-full', DOUGHNUT_SLOT_FILL_CLASSES[row.slot])} />
            <span className='text-foreground min-w-0 flex-1 truncate text-sm'>{row.label}</span>
            <span className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
              <span className='block'>{formatRowValue(row.value)}</span>
              <span className='block'>{percentOf(row.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
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

  if (!query.data) {
    const needsRole = query.error instanceof Error && query.error.message.includes(MONITORING_ROLE_MISSING);
    return (
      <p className='bg-muted/50 border-border text-foreground rounded-2xl border p-4 text-sm'>
        {needsRole
          ? "Google isn't letting the functions read usage yet. In Google Cloud, give the Cloud Functions service account the Monitoring Viewer role, then refresh."
          : "We couldn't load usage just now. Refresh to try again."}
      </p>
    );
  }

  const usage = query.data;
  const products = [...new Set(usage.lines.map((line) => line.product))];
  const overCount = usage.lines.filter((line) => getStatus(line) !== 'within').length;
  const appNames = new Map(apps.map((app) => [app.id, app.name || app.id]));

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile
          label='Estimated this month'
          value={formatCost(usage.projectedCostUsd)}
          help={
            <HelpTip title='Estimated this month'>
              The Blaze charge above the free amounts if the rest of the month looks like the days so far. The
              free amounts are the same ones Spark gives you, but Spark stops at them instead of charging, and
              Storage and Functions need Blaze anyway. It&apos;s an estimate from list prices, not your bill.
            </HelpTip>
          }
        />
        <StatTile label='So far this month' value={formatCost(usage.monthToDateCostUsd)} />
      </div>
      <p className='text-muted-foreground text-xs'>
        {overCount === 0
          ? 'Everything is within the free amounts.'
          : `${overCount} of ${usage.lines.length} limits are over the free amount or on pace to be.`}{' '}
        Updated {formatDateTime(usage.generatedAt)}.
      </p>
      {query.isError ? (
        <p className='text-muted-foreground text-xs'>Couldn&apos;t refresh just now; showing the last numbers.</p>
      ) : null}

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
          <AppShare footprints={usage.footprints} appNames={appNames} />
        ) : (
          <p className='text-muted-foreground text-sm'>We couldn&apos;t measure stored data just now.</p>
        )}
      </section>

      <p className='text-muted-foreground text-xs'>Prices last checked {usage.pricingCheckedOn}.</p>
    </div>
  );
}

export default FirebaseUsageView;
