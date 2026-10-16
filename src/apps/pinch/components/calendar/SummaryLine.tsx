import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import MacroStats from '@/components/MacroStats';
import { useAppSelector } from '@/store';
import { formatMacro } from '@/utils/macroUtils';
import { NUTRITION_CELLS } from '@apps/pinch/constants';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import {
  getCostAverages,
  getPeriodCostText,
  withWholeCalories,
  type PeriodStats,
} from '@apps/pinch/utils/stats';

interface SummaryLineProps {
  /** "This week" or "This month" while the period holds today; null for another period, whose title above already names it. */
  label: string | null;
  stats: PeriodStats;
  isPast: boolean;
  /** Whether the period's averages show on a second line (View options). */
  showAverages: boolean;
  onOpen: () => void;
}

const FACT_CLASS =
  "inline-flex items-baseline whitespace-nowrap before:w-4 before:shrink-0 before:text-center before:content-['·']";

/** The calendar's line about the period shown: how many meals and what they cost, then the period's averages when there are any; a tap opens the summary. */
function SummaryLine({
  label,
  stats,
  isPast,
  showAverages,
  onOpen,
}: SummaryLineProps) {
  const show = useAppSelector(selectShowNutrition);
  const mealsText = `${stats.plannedCount} ${stats.plannedCount === 1 ? 'meal' : 'meals'}`;
  const costText = getPeriodCostText(stats, isPast);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const averages = showAverages ? getCostAverages(stats, show.protein) : [];
  const daily = withWholeCalories(stats.dailyNutrition);
  const hasDaily = showAverages && hasShownValue(daily, show);
  const dailyText = NUTRITION_CELLS.flatMap((cell) => {
    const value = daily[cell.key];
    return show[cell.key] && value !== null
      ? [
          `${formatMacro(cell.key, value)}${cell.unit} ${cell.label.toLowerCase()}`,
        ]
      : [];
  }).join(', ');
  const ariaLabel = [
    label,
    mealsText,
    costText,
    isPartial ? 'some ingredients left out' : null,
    ...averages.map((average) => `${average.label} ${average.value}`),
    hasDaily ? `daily average ${dailyText}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Button
      type='button'
      variant='tertiary'
      aria-label={`${ariaLabel}. Open the summary`}
      onClick={onOpen}
      className='h-auto min-h-10 w-full flex-col items-stretch justify-center gap-0.5 px-0! py-1 text-left text-sm font-normal'
    >
      <span className='flex flex-wrap items-center justify-between gap-x-3'>
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
      </span>
      {(averages.length > 0 || hasDaily) && (
        <span className='block overflow-x-clip pr-5'>
          {/* Each figure carries its dot in front and the row starts one dot to the left, so a line's first dot is clipped. */}
          <span className='text-muted-foreground -ml-4 flex flex-wrap text-xs'>
            {averages.map((average) => (
              <span key={average.key} className={FACT_CLASS}>
                {average.label}
                <span className='text-foreground ml-1'>{average.value}</span>
              </span>
            ))}
            {hasDaily && (
              <span className={FACT_CLASS}>
                Daily average
                <MacroStats
                  values={daily}
                  show={show}
                  className='text-foreground ml-1 gap-x-2'
                />
              </span>
            )}
          </span>
        </span>
      )}
    </Button>
  );
}

export default SummaryLine;
