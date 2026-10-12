import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import StatTile from '@/components/StatTile';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import type { Gap } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import type { MonthStats } from '@apps/pinch/utils/stats';

interface StatsRowProps {
  uid: string;
  stats: MonthStats;
  onOpenBreakdown: () => void;
  onFillIn: (gaps: Gap[]) => void;
}

/** What the shown month costs and the average per meal, with what they leave out always said and a nudge to fill it in. */
function StatsRow({ uid, stats, onOpenBreakdown, onFillIn }: StatsRowProps) {
  const leftOutCount = countLeftOutIngredients(stats.leftOut);

  return (
    <div className='space-y-2'>
      <div className='grid grid-cols-2 gap-2'>
        <StatTile
          label='Spent'
          value={formatCost(stats.spendCents)}
          detail={
            leftOutCount > 0 ? (
              <span className='text-muted-foreground text-xs'>
                leaves out {leftOutCount}{' '}
                {leftOutCount === 1 ? 'item' : 'items'}
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
      </div>
      <GapNudge uid={uid} gaps={stats.leftOut} onFillIn={onFillIn} />
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
