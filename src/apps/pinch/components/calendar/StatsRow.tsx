import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import type { CalendarView } from '@apps/pinch/constants';
import {
  selectDismissedNudges,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import {
  countLeftOutIngredients,
  withoutDismissed,
} from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasAnyMetricOn,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories, type PeriodStats } from '@apps/pinch/utils/stats';

interface StatsRowProps {
  uid: string;
  stats: PeriodStats;
  view: CalendarView;
  onOpenBreakdown: () => void;
  onFillIn: (gaps: Gap[]) => void;
  onOpenSettings: () => void;
}

const PERIOD_PHRASES: Record<CalendarView, string> = {
  month: 'this month',
  week: 'this week',
  day: 'that day',
};

/** A big total drops its cents and a long one its size, so five figures never run under the warning icon in a three-across tile. */
const formatTileCost = (cents: number) =>
  cents >= 100_000
    ? formatCost(Math.round(cents / 100) * 100).replace(/\.00$/, '')
    : formatCost(cents);

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What the shown period costs, as a few tiles: spend, average per meal, cost per gram of protein, and the daily calories and macros the person switched on. */
/** A tile's number, a size smaller on a phone as it grows so it never runs under the tile's help icon. */
function FittedValue({ text }: { text: string }) {
  return (
    <span
      className={join(
        text.length > 6 && 'max-sm:text-sm',
        text.length >= 6 && 'max-[360px]:text-xs',
      )}
    >
      {text}
    </span>
  );
}

function StatsRow({
  uid,
  stats,
  view,
  onOpenBreakdown,
  onFillIn,
  onOpenSettings,
}: StatsRowProps) {
  const show = useAppSelector(selectShowNutrition);
  const dismissed = useAppSelector(selectDismissedNudges);
  const isPhone = useMediaQuery().isBelow('sm');
  const leftOutCount = countLeftOutIngredients(stats.leftOut);
  const noPriceCount = countLeftOutIngredients(
    stats.leftOut.filter((gap) => gap.kind === 'NO_PRODUCT'),
  );
  const noSizeCount = countLeftOutIngredients(
    stats.leftOut.filter((gap) => gap.kind === 'NOT_COMPARABLE'),
  );
  const gaps = [
    ...stats.openLeftOut,
    ...getNutritionGaps(stats.openNutritionMissing, show),
  ];
  const hasNudge = withoutDismissed(gaps, dismissed).length > 0;
  const phrase = PERIOD_PHRASES[view];
  const reasons = [
    noPriceCount > 0
      ? `${pluralize(noPriceCount, 'ingredient')} with no price yet`
      : null,
    noSizeCount > 0
      ? `${pluralize(noSizeCount, 'ingredient')} whose package size can't be compared`
      : null,
  ].filter(Boolean);

  return (
    <div className='space-y-3'>
      <div
        className={
          show.protein ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'
        }
      >
        <StatTile
          label={isPhone ? 'Spent' : `Spent ${phrase}`}
          value={<FittedValue text={formatTileCost(stats.spendCents)} />}
          help={
            leftOutCount > 0 ? (
              <HelpTip
                variant='warning'
                title="What's left out"
                placement='bottom'
              >
                <p>Leaves out {reasons.join(' and ')}.</p>
                <p className='text-muted-foreground'>
                  A price you add now counts from today on: days that have
                  passed keep the prices they had. To count it on one, open that
                  day.
                </p>
              </HelpTip>
            ) : undefined
          }
        />
        <StatTile
          label='Avg per meal'
          value={
            <FittedValue
              text={
                stats.avgPerMealCents === null
                  ? '—'
                  : formatCost(stats.avgPerMealCents)
              }
            />
          }
          help={
            <HelpTip title='Average per meal' placement='bottom'>
              Spend divided by the meals that have a price.
            </HelpTip>
          }
        />
        {show.protein && (
          <StatTile
            label='Per g protein'
            value={
              <FittedValue
                text={
                  stats.proteinCentsPerGram === null
                    ? '—'
                    : formatCost(stats.proteinCentsPerGram)
                }
              />
            }
          />
        )}
      </div>
      {stats.plannedCount > 0 && hasShownValue(stats.dailyNutrition, show) && (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs font-medium'>
            {view === 'day' ? 'Nutrition that day' : `Daily average ${phrase}`}
          </p>
          <MacroStats
            variant='tiles'
            isCompact
            values={withWholeCalories(stats.dailyNutrition)}
            show={show}
          />
        </div>
      )}
      <div className='space-y-0.5'>
        <GapNudge uid={uid} gaps={gaps} onFillIn={onFillIn} />
        {!hasAnyMetricOn(show) && !hasNudge && (
          <Button
            type='button'
            variant='link'
            className='h-10 justify-start px-1! text-sm'
            onClick={onOpenSettings}
          >
            Want calories or protein here?
          </Button>
        )}
        {stats.plannedCount > 0 && (
          <Button
            type='button'
            variant='tertiary'
            className='text-muted-foreground! h-10 w-full justify-between px-1! text-sm font-normal'
            onClick={onOpenBreakdown}
          >
            See the breakdown
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
      </div>
    </div>
  );
}

export default StatsRow;
