import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import StatTile from '@/components/StatTile';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import NutritionLine from '@apps/pinch/components/shared/NutritionLine';
import type { Gap } from '@apps/pinch/types';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasAnyMetricOn,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { useAppSelector } from '@/store';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { MonthStats } from '@apps/pinch/utils/stats';

interface StatsRowProps {
  uid: string;
  stats: MonthStats;
  onOpenBreakdown: () => void;
  onFillIn: (gaps: Gap[]) => void;
  onOpenSettings: () => void;
}

/** What the shown month costs and the average per meal, with what they leave out always said and a nudge to fill it in. */
function StatsRow({
  uid,
  stats,
  onOpenBreakdown,
  onFillIn,
  onOpenSettings,
}: StatsRowProps) {
  const show = useAppSelector(selectShowNutrition);
  const leftOutCount = countLeftOutIngredients(stats.leftOut);
  const gaps = [
    ...stats.openLeftOut,
    ...getNutritionGaps(stats.openNutritionMissing, show),
  ];

  return (
    <div className='space-y-2'>
      <div
        className={
          show.protein ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'
        }
      >
        <StatTile
          label='Spent'
          value={formatCost(stats.spendCents)}
          detail={
            leftOutCount > 0 ? (
              <span className='text-muted-foreground text-xs'>
                {formatLeftOut(stats.leftOut)}
              </span>
            ) : undefined
          }
        />
        <StatTile
          label='Avg / meal'
          value={
            stats.avgPerMealCents === null
              ? '—'
              : formatCost(stats.avgPerMealCents)
          }
          help={
            <HelpTip title='Average per meal' placement='bottom'>
              The month's spend divided by the planned meals that have at least
              one price, so a meal with nothing priced doesn't pull the average
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
        <p className='text-muted-foreground text-sm'>
          {
            <>
              Daily average ·{' '}
              <NutritionLine values={stats.dailyNutrition} show={show} />
            </>
          }
        </p>
      )}
      <GapNudge uid={uid} gaps={gaps} onFillIn={onFillIn} />
      {!hasAnyMetricOn(show) && (
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
  );
}

export default StatsRow;
