import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import MacroStats from '@/components/MacroStats';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useAppSelector } from '@/store';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { Gap } from '@apps/pinch/types';
import { addDaysToKey, formatDayTitle } from '@apps/pinch/utils/dayKeys';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import { withWholeCalories, type PeriodStats } from '@apps/pinch/utils/stats';

interface NutritionSummarySheetProps {
  uid: string;
  /** The period shown, already worded ("Oct 15 – 21", "October 2026"). */
  title: string;
  stats: PeriodStats;
  todayKey: string;
  onClose: () => void;
  onOpenDay: (dayKey: string) => void;
  onFillIn: (gaps: Gap[]) => void;
}

/** The numbers the Calendar's nutrition tiles average, day by day: the daily average first, then each day's own figures, each opening its drawer. */
function NutritionSummarySheet({
  uid,
  title,
  stats,
  todayKey,
  onClose,
  onOpenDay,
  onFillIn,
}: NutritionSummarySheetProps) {
  const show = useAppSelector(selectShowNutrition);
  const isShort = useIsShortScreen();
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const gaps = getNutritionGaps(stats.openNutritionMissing, show);
  const days = stats.byDay.filter((day) => day.count > 0);

  const getDayLabel = (dayKey: string) => {
    if (dayKey === todayKey) return 'Today';
    if (dayKey === tomorrowKey) return 'Tomorrow';
    return formatDayTitle(dayKey);
  };

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title='Nutrition'
      footer={
        <div className='px-4 pb-4'>
          <Button type='button' className='w-full' onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className='flex max-h-[max(12rem,calc(92dvh-15rem))] flex-col gap-3'>
        <div className='shrink-0 space-y-3'>
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs font-medium'>
              {title} · daily average
            </p>
            <MacroStats
              variant='tiles'
              isCompact={isShort}
              values={withWholeCalories(stats.dailyNutrition)}
              show={show}
            />
          </div>
          <GapNudge uid={uid} gaps={gaps} onFillIn={onFillIn} />
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto [@media(max-height:800px)]:min-h-36'>
          <ul aria-label='Days' className='divide-border divide-y'>
            {days.map((day) => {
              const values = withWholeCalories(day.nutrition);
              const hasValues = hasShownValue(values, show);
              return (
                <li key={day.dayKey}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Open ${formatDayTitle(day.dayKey)}`}
                    onClick={() => onOpenDay(day.dayKey)}
                    className='h-auto min-h-11 w-full items-start justify-start gap-3 px-0! py-2 text-left font-normal focus-visible:-outline-offset-2'
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block text-sm font-medium'>
                        {getDayLabel(day.dayKey)}
                      </span>
                      <span className='text-muted-foreground block text-sm'>
                        {hasValues ? (
                          <MacroStats values={values} show={show} />
                        ) : (
                          'Nothing known yet'
                        )}
                      </span>
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
        </div>
      </div>
    </DetailSheet>
  );
}

export default NutritionSummarySheet;
