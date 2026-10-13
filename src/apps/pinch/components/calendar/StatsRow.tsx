import { Button } from '@moondreamsdev/dreamer-ui/components';
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

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What the shown period costs, as a few tiles: spend, average per meal, cost per gram of protein, and the daily calories and macros the person switched on. */
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
          value={formatCost(stats.spendCents)}
          help={
            leftOutCount > 0 ? (
              <HelpTip
                variant='warning'
                title="What's left out"
                placement='bottom'
              >
                <p>Leaves out {reasons.join(' and ')}.</p>
                <p className='text-muted-foreground'>
                  The total goes up once they're priced.
                </p>
              </HelpTip>
            ) : undefined
          }
        />
        <StatTile
          label='Avg per meal'
          value={
            stats.avgPerMealCents === null
              ? '—'
              : formatCost(stats.avgPerMealCents)
          }
          help={
            <HelpTip title='Average per meal' placement='bottom'>
              The spend divided by the planned meals that have at least one
              price, so a meal with nothing priced doesn't pull the average
              toward zero.
            </HelpTip>
          }
        />
        {show.protein && (
          <StatTile
            label='Per g protein'
            value={
              stats.proteinCentsPerGram === null
                ? '—'
                : formatCost(stats.proteinCentsPerGram)
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
