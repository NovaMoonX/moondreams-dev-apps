import { useMemo, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useAppSelector } from '@/store';
import PeriodLeftOutHelp from '@apps/pinch/components/calendar/PeriodLeftOutHelp';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import {
  selectPlannedMeals,
  selectRecipesById,
  selectShowNutrition,
} from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import {
  addDaysToKey,
  formatDayTitle,
  type DayRange,
} from '@apps/pinch/utils/dayKeys';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import {
  getCostAverages,
  getDayCostText,
  getPeriodCostText,
  getPricedCoverage,
  withWholeCalories,
  type PeriodStats,
} from '@apps/pinch/utils/stats';

interface WeekSummarySheetProps {
  uid: string;
  /** The period shown, already worded ("Oct 15 – 21", "October 2026"). */
  title: string;
  range: DayRange;
  stats: PeriodStats;
  todayKey: string;
  /** The averages already show as tiles on the Calendar, so the sheet leaves them out. */
  isStatsOnFront: boolean;
  /** A later action for the whole period (putting it on the shopping list) renders here, under the cost. */
  addToShoppingSlot?: ReactNode;
  onClose: () => void;
  onOpenDay: (dayKey: string) => void;
  onFillIn: (gaps: Gap[]) => void;
}

const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The period shown (a week, or a month in Month) in one sheet: its cost and how much of it is priced, its days, each opening its drawer, and a few reference figures. */
function WeekSummarySheet({
  uid,
  title,
  range,
  stats,
  todayKey,
  isStatsOnFront,
  addToShoppingSlot,
  onClose,
  onOpenDay,
  onFillIn,
}: WeekSummarySheetProps) {
  const show = useAppSelector(selectShowNutrition);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const recipesById = useAppSelector(selectRecipesById);
  const { startKey, endKey } = range;
  const coverage = useMemo(
    () =>
      getPricedCoverage(
        plannedMeals,
        { startKey, endKey },
        recipesById,
        stats.leftOut,
      ),
    [plannedMeals, startKey, endKey, recipesById, stats.leftOut],
  );
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const gaps = [
    ...stats.openLeftOut,
    ...getNutritionGaps(stats.openNutritionMissing, show),
  ];
  const references = isStatsOnFront
    ? []
    : [
        ...getCostAverages(stats, show.protein),
        hasShownValue(stats.dailyNutrition, show)
          ? {
              key: 'nutrition',
              label: 'Daily average',
              value: (
                <MacroStats
                  values={withWholeCalories(stats.dailyNutrition)}
                  show={show}
                />
              ),
            }
          : null,
      ].filter((reference) => reference !== null);

  const getDayLabel = (dayKey: string) => {
    if (dayKey === todayKey) return 'Today';
    if (dayKey === tomorrowKey) return 'Tomorrow';
    return formatDayTitle(dayKey);
  };

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <div className='px-4 pb-4'>
          <Button type='button' className='w-full' onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className='flex max-h-[max(12rem,calc(92dvh-22rem))] flex-col gap-3'>
        <div className='shrink-0 space-y-3'>
          <StatTile
            label='Cost'
            value={getPeriodCostText(stats, endKey < todayKey)}
            detail={
              isPartial
                ? `${coverage.pricedCount} of ${pluralize(coverage.usedCount, 'ingredient')} priced`
                : undefined
            }
            help={
              isPartial ? (
                <PeriodLeftOutHelp stats={stats} todayKey={todayKey} />
              ) : undefined
            }
          />
          <GapNudge uid={uid} gaps={gaps} onFillIn={onFillIn} />
          {addToShoppingSlot}
        </div>
        <div className='flex-1 overflow-y-auto [@media(max-height:800px)]:min-h-36'>
          <ul aria-label='Days' className='divide-border divide-y'>
            {stats.byDay.map((day) => {
              const label = getDayLabel(day.dayKey);
              const costText = getDayCostText(day, day.dayKey < todayKey);
              return (
                <li key={day.dayKey}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Open ${formatDayTitle(day.dayKey)}: ${pluralize(day.count, 'meal')}, ${costText}`}
                    onClick={() => onOpenDay(day.dayKey)}
                    className='h-auto min-h-11 w-full items-start justify-start gap-3 px-0! py-2 text-left font-normal'
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block text-sm font-medium'>
                        {label}
                      </span>
                      <span className='text-muted-foreground block text-xs'>
                        {pluralize(day.count, 'meal')}
                      </span>
                    </span>
                    <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                      {costText}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
          {references.length > 0 && (
            <dl className='border-border space-y-1 border-t pt-3 text-sm'>
              {references.map((reference) => (
                <div
                  key={reference.key}
                  className='flex items-baseline justify-between gap-3'
                >
                  <dt className='text-muted-foreground'>{reference.label}</dt>
                  <dd className='text-right'>{reference.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </DetailSheet>
  );
}

export default WeekSummarySheet;
