import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ExternalLink, Wallet } from 'lucide-react';

import Doughnut from '@/components/Doughnut';
import {
  DOUGHNUT_SLOT_CLASSES,
  DOUGHNUT_SLOT_FILL_CLASSES,
} from '@/components/doughnutPalette';
import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import useNow from '@/hooks/useNow';
import { APP_REGISTRY } from '@/lib/app/app.registry';
import type { PipelineSessionCost } from '@lib/admin/pipelineTypes';
import IconTile from '@/ui/IconTile';
import { formatDateShortUTC } from '@/utils/formatUtils';

import { CARD_CLASS, LIST_CARD_CLASS, SURFACE_CLASS } from './constants';
import {
  formatTileUsd,
  formatTokens,
  formatUsd,
  getBreakdowns,
  getChangeEffects,
  getDailyBars,
  getDayKey,
  getPeriodTotals,
  getPriceTable,
  getSuggestions,
  getTopSessions,
  percent,
  type CostTotals,
  type DayBar,
  type Slice,
  type Suggestion,
} from './pipelineCost';
import { LOG_ROWS } from './pipelineLog';
import { usePipelineCost } from './usePipelineCost';

const MAX_EFFECTS = 6;
const SITE_AND_PIPELINE = 'Site and pipeline';
const APP_NAMES = new Map(
  APP_REGISTRY.map((app) => [app.id as string, app.name]),
);
const getAppName = (appId: string | null) =>
  appId === null ? SITE_AND_PIPELINE : (APP_NAMES.get(appId) ?? appId);

const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <h2 className='text-base font-semibold'>{title}</h2>
      {note ? <p className='text-muted-foreground text-sm'>{note}</p> : null}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <li
      className={join(
        CARD_CLASS,
        'border-l-foreground/20 border-l-2',
        'space-y-1',
      )}
    >
      {suggestion.subject ? (
        <p className='text-muted-foreground truncate text-xs'>
          {suggestion.url ? (
            <a
              href={suggestion.url}
              target='_blank'
              rel='noreferrer'
              className='underline-offset-2 hover:underline'
            >
              {suggestion.subject}
            </a>
          ) : (
            suggestion.subject
          )}
        </p>
      ) : null}
      <p className='text-sm font-semibold'>{suggestion.what}</p>
      <p className='text-muted-foreground text-sm'>{suggestion.todo}</p>
    </li>
  );
}

function Tiles({
  totals,
  unpricedTokens,
}: {
  totals: ReturnType<typeof getPeriodTotals>;
  unpricedTokens: number;
}) {
  const tiles: { label: string; totals: CostTotals }[] = [
    { label: 'Today', totals: totals.today },
    { label: 'Last 7 days', totals: totals.week },
    { label: 'Last 30 days', totals: totals.month },
  ];
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-3 gap-3'>
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            className={SURFACE_CLASS}
            isStacked
            label={tile.label}
            value={
              <span className='text-base min-[360px]:text-xl'>
                {formatTileUsd(tile.totals.usd)}
              </span>
            }
            detail={
              <>
                <span className='block'>
                  {formatTokens(tile.totals.tokens)} tokens
                </span>
                <span className='block'>
                  {tile.totals.sessions}{' '}
                  {tile.totals.sessions === 1 ? 'session' : 'sessions'}
                </span>
              </>
            }
          />
        ))}
      </div>
      <p className='text-muted-foreground flex flex-wrap items-center justify-center gap-x-1 text-xs'>
        API-equivalent dollars, not a bill
        <HelpTip title='What these dollars mean'>
          Dollars here are what the tokens would cost at the list prices
          Anthropic charges developers. Your Claude Max plan spends usage, not
          money, so use them to compare days and changes, not as a bill.
        </HelpTip>
        <span aria-hidden='true'>·</span>
        Days end at midnight UTC.
      </p>
      {unpricedTokens > 0 ? (
        <p className='text-muted-foreground text-center text-xs'>
          {formatTokens(unpricedTokens)} tokens on a model without a price (last
          30 days)
        </p>
      ) : null}
    </div>
  );
}

function DayChart({ bars, today }: { bars: DayBar[]; today: string }) {
  const max = Math.max(...bars.map((bar) => bar.usd), 0);
  const first = bars[0];
  return (
    <section className={join(CARD_CLASS, 'space-y-3')}>
      <SectionTitle
        title='Dollars per day'
        note={
          first
            ? `Last 14 days: ${formatDateShortUTC(toMs(first.day))} to ${formatDateShortUTC(toMs(today))}`
            : undefined
        }
      />
      <ul
        className='flex h-36 items-stretch gap-1'
        aria-label='Dollars per day'
      >
        {bars.map((bar) => {
          const isToday = bar.day === today;
          const label = `${formatDateShortUTC(toMs(bar.day))}: ${formatUsd(bar.usd)}${isToday ? ' (today)' : ''}`;
          const showValue = bar.usd > 0 && (isToday || bar.usd === max);
          return (
            <li
              key={bar.day}
              className='flex min-w-0 flex-1 flex-col items-center justify-end gap-1'
              title={label}
            >
              <span className='sr-only'>{label}</span>
              <span
                aria-hidden='true'
                className='text-muted-foreground h-4 text-[10px] leading-4 whitespace-nowrap tabular-nums'
              >
                {showValue ? formatTileUsd(bar.usd) : ''}
              </span>
              <span
                aria-hidden='true'
                className={join(
                  'w-full rounded-t-md',
                  isToday ? 'bg-primary' : 'bg-primary/25',
                )}
                style={{
                  height: `${max > 0 ? Math.max(2, (bar.usd / max) * 84) : 2}px`,
                }}
              />
              <span
                aria-hidden='true'
                className={join(
                  'text-[10px] leading-4 tabular-nums',
                  isToday
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground',
                )}
              >
                {Number(bar.day.slice(8))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SliceRows({
  slices,
  label,
  hasDots = false,
  getNote,
}: {
  slices: Slice[];
  label: string;
  hasDots?: boolean;
  getNote?: (slice: Slice) => string | null;
}) {
  return (
    <ul aria-label={label} className='divide-border/60 divide-y'>
      {slices.map((slice, index) => {
        const note = getNote?.(slice) ?? null;
        return (
          <li key={slice.id} className='py-2.5'>
            <div className='flex items-center gap-3'>
              {hasDots ? (
                <span
                  aria-hidden='true'
                  className={join(
                    'size-3 shrink-0 rounded-full',
                    DOUGHNUT_SLOT_FILL_CLASSES[
                      index % DOUGHNUT_SLOT_FILL_CLASSES.length
                    ],
                  )}
                />
              ) : null}
              <span className='text-foreground min-w-0 flex-1 truncate text-sm'>
                {slice.label}
              </span>
              <span className='text-foreground shrink-0 text-sm font-medium tabular-nums'>
                {note ?? formatUsd(slice.usd)}
              </span>
              <span className='text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums'>
                {note ? '' : percent(slice.share)}
              </span>
            </div>
            {hasDots ? null : (
              <div
                aria-hidden='true'
                className='bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full'
              >
                <div
                  className='bg-foreground/40 h-full rounded-full'
                  style={{ width: `${Math.round(slice.share * 100)}%` }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WhereItWent({
  breakdowns,
}: {
  breakdowns: ReturnType<typeof getBreakdowns>;
}) {
  const { phases, apps, models } = breakdowns;
  const total = phases.reduce((sum, slice) => sum + slice.usd, 0);
  return (
    <section className={join(CARD_CLASS, 'space-y-4')}>
      <SectionTitle title='Where it went' note='The last 30 days' />
      <SectionDivider label='By phase' />
      <p className='text-muted-foreground -mt-2 text-xs'>
        Conversation is replies that used no tools.
      </p>
      <div className='flex flex-col items-center gap-3 sm:flex-row sm:gap-6'>
        <Doughnut
          size={150}
          ariaLabel='Dollars by phase, last 30 days'
          isDecorative
          segments={phases.map((slice, index) => ({
            id: slice.id,
            label: slice.label,
            value: slice.usd,
            valueText: `${formatUsd(slice.usd)} (${percent(slice.share)})`,
            className:
              DOUGHNUT_SLOT_CLASSES[index % DOUGHNUT_SLOT_CLASSES.length] ?? '',
          }))}
          center={
            <>
              <span className='text-foreground text-lg leading-tight font-semibold'>
                {formatTileUsd(total)}
              </span>
              <span className='text-muted-foreground text-xs'>30 days</span>
            </>
          }
        />
        <div className='w-full min-w-0 sm:flex-1'>
          <SliceRows slices={phases} label='Dollars by phase' hasDots />
        </div>
      </div>
      <SectionDivider label='By app' />
      <SliceRows slices={apps} label='Dollars by app' />
      <SectionDivider label='By model' />
      <SliceRows
        slices={models}
        label='Dollars by model'
        getNote={(slice) =>
          slice.usd === 0 && slice.tokens > 0 ? 'No price' : null
        }
      />
    </section>
  );
}

function TopSessions({
  sessions,
  today,
}: {
  sessions: PipelineSessionCost[];
  today: string;
}) {
  const top = getTopSessions(sessions, today);
  if (top.length === 0) return null;
  return (
    <section className='space-y-3'>
      <SectionTitle title='Most expensive sessions' note='The last 30 days' />
      <ul className={LIST_CARD_CLASS}>
        {top.map((session) => {
          const body = (
            <>
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block truncate text-sm font-semibold'>
                  {session.branch ?? 'A session'}
                </span>
                <span className='text-muted-foreground block text-xs'>
                  {getAppName(session.app)}
                </span>
                <span className='text-muted-foreground block pt-0.5 text-xs'>
                  {session.why}
                </span>
              </span>
              <span className='text-foreground shrink-0 text-sm font-medium tabular-nums'>
                {formatUsd(session.usd)}
              </span>
              {session.url ? (
                <ExternalLink
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              ) : null}
            </>
          );
          const className = 'flex items-center gap-3 px-4 py-3';
          return (
            <li key={session.sessionId}>
              {session.url ? (
                <a
                  href={session.url}
                  target='_blank'
                  rel='noreferrer'
                  aria-label={`Open ${session.branch ?? 'session'} in Claude Code`}
                  className={join(className, 'hover:bg-muted/50')}
                >
                  {body}
                </a>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChangeEffects({
  sessions,
  today,
}: {
  sessions: PipelineSessionCost[];
  today: string;
}) {
  const effects = getChangeEffects(sessions, LOG_ROWS, today).slice(
    0,
    MAX_EFFECTS,
  );
  if (effects.length === 0) return null;
  return (
    <section className='space-y-3'>
      <SectionTitle
        title='What changed and what it did to the average session'
        note='The average session in the week before each pipeline change, against the week after. Other things change too, and sessions still running are included, so read it as a hint.'
      />
      <ul className={LIST_CARD_CLASS}>
        {effects.map((effect) => {
          const change = (effect.after - effect.before) / effect.before;
          const isDown = change < 0;
          return (
            <li key={effect.date} className='space-y-1 px-4 py-3'>
              <p className='text-muted-foreground text-xs'>
                {formatDateShortUTC(toMs(effect.date))}
              </p>
              {effect.changes.length === 1 ? (
                <p className='line-clamp-2 text-sm'>{effect.changes[0]}</p>
              ) : (
                <>
                  <p className='text-sm font-medium'>
                    {effect.changes.length} changes landed
                  </p>
                  <p className='text-muted-foreground line-clamp-2 text-xs'>
                    For example: {effect.changes[0]}
                  </p>
                </>
              )}
              <p className='text-xs'>
                <span className='text-muted-foreground tabular-nums'>
                  {formatUsd(effect.before)} to {formatUsd(effect.after)} a
                  session
                </span>{' '}
                <span
                  className={join(
                    'font-medium',
                    isDown ? 'text-success' : 'text-warning',
                  )}
                >
                  {isDown ? 'down' : 'up'} {percent(Math.abs(change))}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HowItIsCounted({ sessions }: { sessions: PipelineSessionCost[] }) {
  const prices = getPriceTable(sessions);
  return (
    <details className={join(CARD_CLASS, 'group')}>
      <summary className='flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden'>
        How it&apos;s counted
        <ChevronDown
          className='text-muted-foreground size-4 transition-transform group-open:rotate-180'
          aria-hidden='true'
        />
      </summary>
      <div className='text-muted-foreground mt-3 space-y-3 text-sm'>
        <p>
          Tokens come from each reply&apos;s usage, helpers included. A phase is
          worked out from the tools a reply used, so it is a good guess, not a
          label Claude wrote. Days are UTC.
        </p>
        <p>
          Dollars are API-equivalent: the tokens at list prices per million
          tokens. A model without a price still has its tokens counted, just not
          its dollars.
        </p>
        {prices.length > 0 ? (
          <table className='w-full text-left text-xs tabular-nums'>
            <caption className='sr-only'>
              List prices per million tokens
            </caption>
            <thead>
              <tr className='text-foreground'>
                <th scope='col' className='py-1 font-medium'>
                  Model
                </th>
                <th scope='col' className='py-1 text-right font-medium'>
                  In
                </th>
                <th scope='col' className='py-1 text-right font-medium'>
                  Cache read
                </th>
                <th scope='col' className='py-1 text-right font-medium'>
                  Out
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <tr key={price.name} className='border-border/60 border-t'>
                  <th scope='row' className='py-1 font-normal'>
                    {price.name}
                  </th>
                  <td className='py-1 text-right'>${price.input}</td>
                  <td className='py-1 text-right'>${price.cacheRead}</td>
                  <td className='py-1 text-right'>${price.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </details>
  );
}

/** What the pipeline spends, where, and what is worth changing. All dollars are API-equivalent. */
function PipelineCostView() {
  const query = usePipelineCost();
  const now = useNow(60_000);

  if (query.isPending) {
    return <p className='text-muted-foreground text-sm'>Loading cost…</p>;
  }

  if (!query.data) {
    return (
      <div className={join(CARD_CLASS, 'space-y-3')}>
        <p className='text-sm'>Couldn&apos;t load the cost. Try again.</p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const sessions = query.data.filter((session) => session.rows.length > 0);
  if (sessions.length === 0) {
    return (
      <div className={join(CARD_CLASS, 'flex items-center gap-4')}>
        <IconTile>
          <Wallet className='size-5' />
        </IconTile>
        <p className='text-muted-foreground min-w-0 text-sm'>
          No cost reported yet. Sessions report it at the end of each turn once
          the pipeline key is set up (
          <code>npm run pipeline:secrets -- key</code>).
        </p>
      </div>
    );
  }

  const today = getDayKey(now);
  const totals = getPeriodTotals(sessions, today);
  const suggestions = getSuggestions(sessions, today);
  const breakdowns = getBreakdowns(sessions, today, getAppName);

  return (
    <div className='space-y-6'>
      {suggestions.length > 0 ? (
        <section className='space-y-3'>
          <SectionTitle title='Worth a look' note='From the last 7 days' />
          <ul className='space-y-3'>
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </ul>
        </section>
      ) : null}

      <Tiles totals={totals} unpricedTokens={breakdowns.unpricedTokens} />

      <DayChart bars={getDailyBars(sessions, today)} today={today} />
      <WhereItWent breakdowns={breakdowns} />
      <TopSessions sessions={sessions} today={today} />
      <ChangeEffects sessions={sessions} today={today} />
      <HowItIsCounted sessions={sessions} />
      <p className='text-muted-foreground text-center text-xs'>
        Cost covers the last 90 days.
      </p>
    </div>
  );
}

export default PipelineCostView;
