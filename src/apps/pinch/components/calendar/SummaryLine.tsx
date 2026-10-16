import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { getPeriodCostText, type PeriodStats } from '@apps/pinch/utils/stats';

interface SummaryLineProps {
  /** "This week" or "This month" while the period holds today; null for another period, whose title above already names it. */
  label: string | null;
  stats: PeriodStats;
  isPast: boolean;
  onOpen: () => void;
}

/** The calendar's one line about the period shown: how many meals and what they cost, opening the summary. */
function SummaryLine({ label, stats, isPast, onOpen }: SummaryLineProps) {
  const mealsText = `${stats.plannedCount} ${stats.plannedCount === 1 ? 'meal' : 'meals'}`;
  const costText = getPeriodCostText(stats, isPast);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const ariaLabel = [
    label,
    mealsText,
    costText,
    isPartial ? 'some ingredients left out' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={`${ariaLabel}. Open the summary`}
      onClick={onOpen}
      className='h-auto min-h-10 w-full flex-wrap items-center justify-between gap-x-3 gap-y-0 px-0! py-1 text-left text-sm font-normal'
    >
      <span className='whitespace-nowrap'>
        {label && <span className='font-medium'>{label} · </span>}
        <span className='text-muted-foreground'>{mealsText}</span>
      </span>
      <span className='ml-auto flex items-center gap-1 whitespace-nowrap'>
        <span className='font-medium'>{costText}</span>
        {isPartial && (
          <TriangleAlert
            className='text-warning h-3.5 w-3.5'
            aria-hidden='true'
          />
        )}
        <ChevronRight
          className='text-muted-foreground h-4 w-4'
          aria-hidden='true'
        />
      </span>
    </Button>
  );
}

export default SummaryLine;
