import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import Doughnut from '@/components/Doughnut';
import {
  DOUGHNUT_SLOT_CLASSES,
  DOUGHNUT_SLOT_FILL_CLASSES,
} from '@/components/doughnutPalette';
import HelpTip from '@/components/HelpTip';
import { PillGroup } from '@/components/PillGroup';
import StatTile from '@/components/StatTile';
import { formatDateTime } from '@/utils/formatUtils';
import {
  firebaseUsageQueryOptions,
  MONITORING_ROLE_MISSING,
  type FirebaseFootprints,
  type FirebaseUsageLine,
} from '@lib/admin/firebaseUsageQueries';
import type { AppMetadata } from '@lib/types/appCatalog';

import { CARD_CLASS } from './constants';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const COUNT_FORMAT = new Intl.NumberFormat('en-US');
const USD_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatBytes = (bytes: number) => {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(1)} MB`;
};
const formatAmount = (line: FirebaseUsageLine, value: number) =>
  line.unit === 'bytes'
    ? formatBytes(value)
    : COUNT_FORMAT.format(Math.round(value));
const formatCost = (usd: number) =>
  usd >= 0.01 ? USD_FORMAT.format(usd) : usd > 0 ? '< $0.01' : '$0.00';

const PERIOD_WORDS = {
  day: 'a day (UTC)',
  month: 'this month',
  stock: 'stored',
} as const;
const USED_WORDS = {
  day: 'Today so far',
  month: 'So far this month',
  stock: 'Stored now',
} as const;

/** Over now, on pace to go over by month end, or inside the free amount. */
const getStatus = (line: FirebaseUsageLine) => {
  if (line.isOver) return 'over';
  if (line.projectedCostUsd > 0) return 'on-pace';
  return 'within';
};

/** Names why the read failed, so a missing grant isn't mistaken for a lost connection. */
const getFailureText = (error: unknown) => {
  const { code = '', message = '' } = (error ?? {}) as {
    code?: string;
    message?: string;
  };
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return "You're offline. Usage loads once you're back.";
  if (
    code === 'functions/failed-precondition' &&
    message.includes(MONITORING_ROLE_MISSING)
  ) {
    return "Google isn't letting the functions read usage yet. In Google Cloud, give the Cloud Functions service account the Monitoring Viewer role, then refresh.";
  }
  if (code === 'functions/permission-denied')
    return "This account isn't the admin, so usage stays hidden.";
  if (code === 'functions/deadline-exceeded')
    return 'Reading usage took too long. Refresh to try again.';
  return "Usage couldn't be read just now. Refresh in a moment.";
};

function UsageRow({ line }: { line: FirebaseUsageLine }) {
  const hasFreeAmount = line.freeAmount > 0;
  const fraction = hasFreeAmount ? line.used / line.freeAmount : 0;
  const ringPercent = hasFreeAmount ? `${Math.round(fraction * 100)}%` : '–';
  const status = getStatus(line);
  const overBy =
    line.period === 'day' ? 0 : Math.max(0, line.used - line.freeAmount);
  const detail = [
    line.daysOver !== null && line.daysOver > 0
      ? `Over the free amount on ${line.daysOver} ${line.daysOver === 1 ? 'day' : 'days'} this month`
      : null,
    overBy > 0 ? `Over by ${formatAmount(line, overBy)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const getStatusText = () => {
    if (status === 'over')
      return `About ${formatCost(line.projectedCostUsd)} this month`;
    if (status === 'on-pace')
      return `On pace for about ${formatCost(line.projectedCostUsd)}`;
    return 'Within the free amount';
  };

  return (
    <li className='flex items-center gap-3 py-3.5'>
      <Doughnut
        size={56}
        ariaLabel={`${line.label}: ${ringPercent} of the free amount`}
        isDecorative
        segments={[
          {
            id: line.id,
            label: line.label,
            value: hasFreeAmount
              ? Math.min(line.used, line.freeAmount)
              : line.used,
            valueText: `${formatAmount(line, line.used)} of ${formatAmount(line, line.freeAmount)}`,
            className:
              status === 'within' ? 'stroke-primary' : 'stroke-warning',
          },
        ]}
        total={hasFreeAmount ? line.freeAmount : line.used}
        center={
          <span className='text-foreground text-[11px] leading-none font-medium'>
            {ringPercent}
          </span>
        }
      />
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-col gap-0.5'>
          <span className='text-foreground text-sm font-medium whitespace-nowrap'>
            {line.label}
          </span>
          <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <span
              aria-hidden='true'
              className={join(
                'size-1.5 shrink-0 rounded-full',
                status === 'within' ? 'bg-success' : 'bg-warning',
              )}
            />
            {getStatusText()}
          </span>
        </div>
        <p className='text-muted-foreground text-xs'>
          {USED_WORDS[line.period]}: {formatAmount(line, line.used)} of{' '}
          {formatAmount(line, line.freeAmount)} {PERIOD_WORDS[line.period]}
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
    ...(isFiles
      ? [
          {
            id: 'shared',
            label: 'Shared (profile photos)',
            value: footprints.sharedStorageBytes,
          },
        ]
      : []),
  ]
    .map((row, index) => ({
      ...row,
      slot: index % DOUGHNUT_SLOT_CLASSES.length,
    }))
    .sort((a, b) =>
      a.id === 'shared' ? 1 : b.id === 'shared' ? -1 : b.value - a.value,
    );
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const formatValue = (value: number) =>
    isFiles ? formatBytes(value) : `${COUNT_FORMAT.format(value)} documents`;
  const percentOf = (value: number) => {
    if (total === 0) return '–';
    if (value > 0 && value / total < 0.01) return '<1%';
    return `${Math.round((value / total) * 100)}%`;
  };
  const formatRowValue = (value: number) =>
    isFiles ? formatBytes(value) : COUNT_FORMAT.format(value);

  return (
    <div className='space-y-4'>
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
                <span className='text-muted-foreground text-xs'>
                  {isFiles ? 'of files' : 'documents'}
                </span>
              </>
            }
          />
        </div>
      )}
      <ul
        aria-label={`${isFiles ? 'Files' : 'Documents'} by app`}
        className='divide-border/60 divide-y'
      >
        {rows.map((row) => (
          <li key={row.id} className='flex items-center gap-3 py-2.5'>
            <span
              aria-hidden='true'
              className={join(
                'size-3 shrink-0 rounded-full',
                DOUGHNUT_SLOT_FILL_CLASSES[row.slot],
              )}
            />
            <span className='text-foreground min-w-0 flex-1 truncate text-sm'>
              {row.label}
            </span>
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
    return (
      <p className={`${CARD_CLASS} text-foreground text-sm`}>
        {getFailureText(query.error)}
      </p>
    );
  }

  const usage = query.data;
  const products = [...new Set(usage.lines.map((line) => line.product))];
  const overCount = usage.lines.filter(
    (line) => getStatus(line) !== 'within',
  ).length;
  const appNames = new Map(apps.map((app) => [app.id, app.name || app.id]));

  return (
    <div className='max-w-3xl space-y-6'>
      <div className='grid grid-cols-2 gap-3'>
        <StatTile
          label='Estimated this month'
          value={formatCost(usage.projectedCostUsd)}
          help={
            <HelpTip title='Estimated this month'>
              The Blaze charge above the free amounts if the rest of the month
              looks like the days so far. The free amounts are the same ones
              Spark gives you, but Spark stops at them instead of charging, and
              Storage and Functions need Blaze anyway. It&apos;s an estimate
              from list prices, not your bill.
            </HelpTip>
          }
        />
        <StatTile
          label='So far this month'
          value={formatCost(usage.monthToDateCostUsd)}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {overCount === 0
          ? 'Everything is within the free amounts.'
          : `${overCount} of ${usage.lines.length} limits are over the free amount or on pace to be.`}{' '}
        Updated {formatDateTime(usage.generatedAt)}.
      </p>
      {usage.isSample ? (
        <p className='bg-muted/50 border-border text-muted-foreground rounded-2xl border p-3 text-xs'>
          Sample numbers: the emulator can&apos;t read Google&apos;s usage.
          Stored data is counted from your seeded data.
        </p>
      ) : null}
      {query.isError ? (
        <p className='text-muted-foreground text-xs'>
          Couldn&apos;t refresh just now; showing the last numbers.
        </p>
      ) : null}

      {products.map((product) => (
        <section key={product} className='space-y-3'>
          <h2 className='text-foreground text-base font-semibold'>{product}</h2>
          <ul
            className={`${CARD_CLASS} divide-border/60 divide-y py-1! sm:py-1!`}
          >
            {usage.lines
              .filter((line) => line.product === product)
              .map((line) => (
                <UsageRow key={line.id} line={line} />
              ))}
          </ul>
        </section>
      ))}

      <section className='space-y-3'>
        <h2 className='text-foreground text-base font-semibold'>
          Stored data by app
        </h2>
        <p className='text-muted-foreground text-xs'>
          Google counts reads, writes and downloads for the whole project, so
          only stored data can be split by app.
          {usage.footprints?.isPartial
            ? ' Very large collections are counted up to a cap, so these are at least this much.'
            : ''}
        </p>
        <div className={CARD_CLASS}>
          {usage.footprints ? (
            <AppShare footprints={usage.footprints} appNames={appNames} />
          ) : (
            <p className='text-muted-foreground text-sm'>
              We couldn&apos;t measure stored data just now.
            </p>
          )}
        </div>
      </section>

      <p className='text-muted-foreground text-xs'>
        Prices last checked {usage.pricingCheckedOn}.
      </p>
    </div>
  );
}

export default FirebaseUsageView;
