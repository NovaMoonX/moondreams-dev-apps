import { memo, useState } from 'react';

import { Calendar } from '@moondreamsdev/dreamer-ui/components';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import DayCell from '@apps/pinch/components/calendar/DayCell';
import type { PlannedMeal } from '@apps/pinch/types';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';

const NO_MEALS: PlannedMeal[] = [];

// The calendar's own cell padding, border and square size are cleared so a day can hold its meals.
// Under 360px the grid's padding and gap become a transparent cell border, so the seven columns stay 41px wide to tap.
const CALENDAR_STYLES = {
  containerClassName: 'border-0 bg-transparent p-0 shadow-none',
  headerClassName: 'hidden',
  monthGridClassName: 'gap-1 max-[359px]:gap-0 max-[359px]:p-0',
  cellClassName:
    'group relative h-[5.5rem] min-h-0 w-full lg:h-[7.5rem] rounded-lg border-0 p-0 bg-muted hover:bg-muted/70 focus:bg-muted max-[359px]:border-2 max-[359px]:border-transparent max-[359px]:bg-clip-padding',
  selectedCellClassName: 'bg-muted text-foreground',
  todayCellClassName: 'border-0',
};

interface MonthViewProps {
  monthKey: string;
  plannedByDay: Map<string, PlannedMeal[]>;
  selectedKey: string | null;
  getMealTitle: (meal: PlannedMeal) => string;
  onSelectDay: (dayKey: string) => void;
}

/** The month grid: every day with its meals, tapping one opens it. */
function MonthView({
  monthKey,
  plannedByDay,
  selectedKey,
  getMealTitle,
  onSelectDay,
}: MonthViewProps) {
  const { isBelow } = useMediaQuery();
  const isPhone = isBelow('sm');
  const isWide = !isBelow('lg');
  const [peekDayKey, setPeekDayKey] = useState<string | null>(null);
  const [year, month] = monthKey.split('-').map(Number);

  return (
    <Calendar
      key={monthKey}
      mode='single'
      size='auto'
      className='mx-auto max-w-2xl lg:max-w-none'
      initialDate={new Date(year, month - 1, 1)}
      showNavigation={false}
      onDateSelect={(date) => {
        setPeekDayKey(null);
        onSelectDay(getCellDayKey(date));
      }}
      customStyles={CALENDAR_STYLES}
      renderCell={(date, _isSelected, _isDisabled, isToday) => {
        const dayKey = getCellDayKey(date);
        return (
          <DayCell
            date={date}
            dayKey={dayKey}
            meals={plannedByDay.get(dayKey) ?? NO_MEALS}
            isSelected={selectedKey === dayKey}
            isToday={isToday}
            isOutsideMonth={dayKey.slice(0, 7) !== monthKey}
            hasPeek={!isPhone}
            getMealTitle={isWide ? getMealTitle : null}
            isPeekOpen={peekDayKey === dayKey}
            onPeekOpenChange={(isOpen) =>
              setPeekDayKey((current) => {
                if (isOpen) return dayKey;
                return current === dayKey ? null : current;
              })
            }
          />
        );
      }}
    />
  );
}

export default memo(MonthView);
