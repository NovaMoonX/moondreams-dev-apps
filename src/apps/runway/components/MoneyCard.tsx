import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import HelpTip from '@/components/HelpTip';
import { PillGroup } from '@/components/PillGroup';
import SegmentedControl from '@/components/SegmentedControl';
import SensitiveValue from '@/components/SensitiveValue';
import TrendLineChart, { type TrendPoint } from '@/components/TrendLineChart';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getNiceMoneyAxis } from '@/utils/chartUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import {
  HOME_WORDS,
  MONEY_CHART_MIN_DAYS,
  MONEY_CHART_WORDS,
} from '@apps/runway/constants';
import { getFreeToSpendFigure } from '@apps/runway/engine/balances';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import type { MoneyPoint, MoneyRange } from '@apps/runway/engine/moneyHistory';
import { useMoneySeries } from '@apps/runway/hooks/useMoneySeries';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import type { DateOnly } from '@apps/runway/types';
import { describeFreeToSpend } from '@apps/runway/utils/balanceText';

type Figure = 'free' | 'all';

const FIGURE_OPTIONS = [
  { value: 'free', label: MONEY_CHART_WORDS.free },
  { value: 'all', label: MONEY_CHART_WORDS.all },
] as const;

const RANGE_LABELS: Record<MoneyRange, string> = {
  '1m': '1M',
  '6m': '6M',
  '1y': '1Y',
  all: 'All',
};

const RANGE_NAMES: Record<MoneyRange, string> = {
  '1m': 'The last month',
  '6m': 'The last six months',
  '1y': 'The last year',
  all: 'Since you started',
};

const FIGURE_KEY = 'runway-home-figure-all';

/** A figure as the hero reads it: Free to Spend below zero is over-assigned, never a minus. */
const formatFigure = (cents: number, figure: Figure) =>
  figure === 'free' && cents < 0
    ? `${HOME_WORDS.overAssigned} ${formatCents(-cents)}`
    : formatCents(cents);

function describeChange(first: number, last: number, sinceText: string) {
  const change = last - first;
  if (change === 0) return `${MONEY_CHART_WORDS.same} ${sinceText}`;
  const word = change > 0 ? MONEY_CHART_WORDS.up : MONEY_CHART_WORDS.down;
  return `${word} ${formatCents(Math.abs(change))} ${sinceText}`;
}

interface MoneyCardProps {
  today: DateOnly;
  lookahead: Lookahead | null;
  /** What a range in the plan's pay or bills means for the figure, when one drives it. */
  rangeNote: string | null;
  onOpen: () => void;
}

/** Home's hero: Free to Spend or all money, with where it has been and where the plan takes it; a finger on the line reads that day into the figure. */
function MoneyCard({ today, lookahead, rangeNote, onOpen }: MoneyCardProps) {
  const balances = useAppSelector(selectBalances);
  const [isAll, setIsAll] = useLocalStoragePreference(FIGURE_KEY, false);
  const [range, setRange] = useState<MoneyRange>('all');
  const [reading, setReading] = useState<TrendPoint | null>(null);
  const { isHidden, toggle } = useValuesHidden();
  const series = useMoneySeries(range, today, lookahead);
  const figure: Figure = isAll ? 'all' : 'free';
  const pick = (point: MoneyPoint) =>
    figure === 'all' ? point.allCents : point.freeCents;

  const free = describeFreeToSpend(getFreeToSpendFigure(balances));
  const label = figure === 'all' ? MONEY_CHART_WORDS.all : free.label;
  const isKnown = balances.isStarted && balances.hasMoney;
  const restValue =
    figure === 'free'
      ? free.value
      : isKnown
        ? formatCents(balances.moneyOnHandCents)
        : HOME_WORDS.notSet;
  const readCents =
    reading === null || isHidden ? null : (reading.y ?? reading.y2 ?? null);
  const value =
    readCents === null ? restValue : formatFigure(readCents, figure);

  const history = series.history ?? [];
  const isYoung = series.spanDays < MONEY_CHART_MIN_DAYS;
  const hasChart = isKnown && !isYoung && history.length >= 2;
  const now = history.at(-1) ?? null;
  const ahead = series.ahead.slice(1);
  const data: TrendPoint[] = [
    ...history.map((point, index) => ({
      x: point.on,
      y: pick(point),
      ...(index === history.length - 1 && ahead.length > 0
        ? { y2: pick(point) }
        : {}),
    })),
    ...ahead.map((point) => ({ x: point.on, y: null, y2: pick(point) })),
  ];
  const values = data.flatMap((point) =>
    [point.y, point.y2].filter((entry): entry is number => entry != null),
  );
  const axis = getNiceMoneyAxis(
    Math.min(...values, 0),
    Math.max(...values, 0),
    3,
  );
  const lowest = ahead.reduce<MoneyPoint | null>(
    (low, point) => (low === null || pick(point) < pick(low) ? point : low),
    null,
  );
  const hasLowest = lowest !== null && now !== null && pick(lowest) < pick(now);
  const formatDay = (x: number) =>
    x === today ? MONEY_CHART_WORDS.today : formatDateShortUTC(x);
  const sinceText =
    series.range === 'all' && !series.isPartial
      ? MONEY_CHART_WORDS.sinceStart
      : `${MONEY_CHART_WORDS.since} ${formatDateShortUTC(history[0]?.on ?? today)}`;
  const getNote = () => {
    if (reading !== null) {
      return reading.x > today
        ? `${MONEY_CHART_WORDS.expected} ${formatDateShortUTC(reading.x)}`
        : `${MONEY_CHART_WORDS.on} ${formatDay(reading.x)}`;
    }
    if (isHidden || !hasChart || now === null) return MONEY_CHART_WORDS.today;
    return describeChange(pick(history[0]), pick(now), sinceText);
  };
  const help = [
    figure === 'all' ? MONEY_CHART_WORDS.allHelp : null,
    hasChart && ahead.length > 0 ? MONEY_CHART_WORDS.aheadHelp : null,
    figure === 'free' && hasChart && ahead.length > 0
      ? MONEY_CHART_WORDS.aheadFreeHelp
      : null,
    rangeNote,
  ].filter((entry): entry is string => entry !== null);

  const getChart = () => {
    if (!isKnown) return null;
    if (isHidden) {
      return (
        <Button
          variant='tertiary'
          size='sm'
          className='relative z-10 -ml-2 h-auto py-1 text-sm font-normal'
          onClick={toggle}
        >
          {MONEY_CHART_WORDS.hidden}
        </Button>
      );
    }
    if (isYoung) {
      return (
        <p className='text-muted-foreground text-sm'>
          {MONEY_CHART_WORDS.young}
        </p>
      );
    }
    if (!hasChart)
      return (
        <div
          className='h-32 [@media(max-height:600px)]:h-24'
          aria-hidden='true'
        />
      );
    return (
      <div className='relative z-10 space-y-3'>
        <div
          role='img'
          aria-label={`${label}, ${RANGE_NAMES[series.range].toLowerCase()}: ${getNote()}.`}
          className='-mr-2'
        >
          <TrendLineChart
            isSoft
            isSecondaryAhead
            className='h-32 [@media(max-height:600px)]:h-24'
            data={data}
            seriesLabel={label}
            secondaryLabel={
              ahead.length > 0 ? MONEY_CHART_WORDS.expected : undefined
            }
            curve='linear'
            hasDots={false}
            formatX={formatDay}
            formatY={formatCentsShort}
            yDomain={axis.domain}
            yTicks={axis.ticks}
            dividers={
              ahead.length > 0
                ? [
                    {
                      x: today,
                      label: MONEY_CHART_WORDS.today,
                      labelAt: 'bottom',
                    },
                  ]
                : undefined
            }
            markers={
              hasLowest && lowest !== null && reading === null
                ? [
                    {
                      x: lowest.on,
                      y: pick(lowest),
                      label: `${MONEY_CHART_WORDS.lowest} ${formatCentsShort(pick(lowest))} · ${formatDateShortUTC(lowest.on)}`,
                      side: 'left',
                    },
                  ]
                : undefined
            }
            onRead={setReading}
          />
        </div>
        {series.ranges.length > 1 && (
          <PillGroup
            isThin
            label={MONEY_CHART_WORDS.range}
            options={series.ranges.map((entry) => ({
              value: entry,
              label: RANGE_LABELS[entry],
              ariaLabel: RANGE_NAMES[entry],
            }))}
            value={series.range}
            onChange={(next) => {
              setReading(null);
              setRange(next);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className='border-border bg-accent relative space-y-3 rounded-2xl border px-4 pt-3 pb-4'>
      <div className='relative z-10'>
        <SegmentedControl
          label={MONEY_CHART_WORDS.figure}
          options={FIGURE_OPTIONS}
          value={figure}
          onChange={(next) => {
            setReading(null);
            setIsAll(next === 'all');
          }}
          className='w-full sm:max-w-72'
        />
      </div>
      <div>
        <Button
          variant='tertiary'
          size='stripped'
          className="text-foreground! static h-auto w-full items-center justify-between gap-3 text-left font-normal after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          aria-label={
            isHidden
              ? `${label}, amount hidden. See it in detail`
              : `${label}, ${restValue}. See it in detail`
          }
          onClick={onOpen}
        >
          <span className='min-w-0 flex-1 text-4xl leading-none font-semibold tracking-tight break-words tabular-nums'>
            <SensitiveValue>{value}</SensitiveValue>
          </span>
          <ChevronRight
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
        {!isHidden && (
          <div className='mt-1.5 flex items-center gap-1'>
            <p className='text-muted-foreground text-sm'>{getNote()}</p>
            {help.length > 0 && (
              <span className='relative z-10'>
                <HelpTip title={label}>
                  {help.map((entry) => (
                    <p key={entry}>{entry}</p>
                  ))}
                </HelpTip>
              </span>
            )}
          </div>
        )}
      </div>
      {getChart()}
    </div>
  );
}

export default MoneyCard;
