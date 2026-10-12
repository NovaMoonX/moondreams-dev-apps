import { memo, useState } from 'react';

import { Button, Calendar } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import DayDrawer from '@apps/pinch/components/calendar/DayDrawer';
import MealBarCell from '@apps/pinch/components/calendar/MealBarCell';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectPlannedByDay,
  selectPlannedMeals,
} from '@apps/pinch/store/selectors';
import type { MealType, PlannedMeal } from '@apps/pinch/types';
import {
  formatMonthTitle,
  getCellDayKey,
  getLocalMonthKey,
  shiftMonthKey,
} from '@apps/pinch/utils/dayKeys';

const NO_MEALS: PlannedMeal[] = [];

// The calendar's own cell padding, border and square size are cleared so a day can hold its thin bars;
// MealBarCell fills the cell absolutely and clips itself.
const CALENDAR_STYLES = {
  containerClassName: 'border-0 bg-transparent p-0 shadow-none',
  headerClassName: 'hidden',
  monthGridClassName: 'gap-1',
  cellClassName:
    'group relative h-[4.75rem] min-h-0 w-full rounded-lg border-0 p-0 bg-muted hover:bg-muted/70 focus:bg-muted',
  selectedCellClassName: 'bg-muted text-foreground',
  todayCellClassName: 'border-0',
};

interface CalendarScreenProps {
  uid: string;
  shownMonth: string;
  onShownMonthChange: (monthKey: string) => void;
}

function CalendarScreen({
  uid,
  shownMonth,
  onShownMonthChange,
}: CalendarScreenProps) {
  const { openSubview } = usePinchOverlay();
  const plannedByDay = useAppSelector(selectPlannedByDay);
  const hasPlannedMeals = useAppSelector(selectPlannedMeals).length > 0;
  const isPlannedLoadFailed = useAppSelector(
    (state) => state.pinch.plannedMeals.loadError !== null,
  );
  const now = useNow();
  const todayKey = getCellDayKey(new Date(now));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [peekDayKey, setPeekDayKey] = useState<string | null>(null);

  const [year, month] = shownMonth.split('-').map(Number);
  const isCurrentMonth = shownMonth === getLocalMonthKey(new Date(now));

  const openPlan = (
    dayKey: string,
    mealType: MealType | null,
    plannedMealId: string | null = null,
  ) => openSubview({ kind: 'plan', dayKey, mealType, plannedMealId });

  const goToMonth = (monthKey: string) => {
    setSelectedKey(null);
    setPeekDayKey(null);
    onShownMonthChange(monthKey);
  };

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Calendar'
        action={
          <Button
            type='button'
            size='sm'
            rounded='full'
            className='gap-1'
            onClick={() => openPlan(selectedKey ?? todayKey, null)}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add
          </Button>
        }
      />
      <div className='flex items-center justify-between gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label='Previous month'
          className='size-10'
          onClick={() => goToMonth(shiftMonthKey(shownMonth, -1))}
        >
          <ChevronLeft className='h-5 w-5' aria-hidden='true' />
        </Button>
        <div className='flex min-w-0 flex-col items-center'>
          <h2 className='truncate text-lg font-semibold'>
            {formatMonthTitle(shownMonth)}
          </h2>
          {!isCurrentMonth && (
            <Button
              type='button'
              variant='link'
              className='h-6 p-0 text-xs'
              onClick={() => goToMonth(getLocalMonthKey(new Date(now)))}
            >
              Back to today
            </Button>
          )}
        </div>
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label='Next month'
          className='size-10'
          onClick={() => goToMonth(shiftMonthKey(shownMonth, 1))}
        >
          <ChevronRight className='h-5 w-5' aria-hidden='true' />
        </Button>
      </div>
      {isPlannedLoadFailed && (
        <p className='text-muted-foreground text-center text-sm'>
          We couldn't load your planned meals just now. Check your connection
          and try again.
        </p>
      )}
      {!hasPlannedMeals && !isPlannedLoadFailed && (
        <div className='bg-secondary/50 space-y-3 rounded-2xl p-4 text-center'>
          <p className='text-sm'>
            An empty month is fine. Plan your first meal, or add a recipe to
            plan from.
          </p>
          <div className='flex flex-wrap justify-center gap-2'>
            <Button
              type='button'
              size='sm'
              rounded='full'
              onClick={() => openPlan(todayKey, null)}
            >
              Plan your first meal
            </Button>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              rounded='full'
              onClick={() => openSubview({ kind: 'recipe', id: null })}
            >
              Add a recipe
            </Button>
          </div>
        </div>
      )}
      <Calendar
        key={shownMonth}
        mode='single'
        size='auto'
        className='mx-auto max-w-2xl'
        initialDate={new Date(year, month - 1, 1)}
        showNavigation={false}
        onDateSelect={(date) => {
          const dayKey = getCellDayKey(date);
          setSelectedKey(dayKey);
          setPeekDayKey(null);
          setOpenDayKey(dayKey);
        }}
        customStyles={CALENDAR_STYLES}
        renderCell={(date, _isSelected, _isDisabled, isToday) => {
          const dayKey = getCellDayKey(date);
          return (
            <MealBarCell
              date={date}
              dayKey={dayKey}
              meals={plannedByDay.get(dayKey) ?? NO_MEALS}
              isSelected={selectedKey === dayKey}
              isToday={isToday}
              isOutsideMonth={dayKey.slice(0, 7) !== shownMonth}
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
      {openDayKey && (
        <DayDrawer
          key={openDayKey}
          uid={uid}
          dayKey={openDayKey}
          onClose={() => setOpenDayKey(null)}
          onAdd={(mealType) => {
            const dayKey = openDayKey;
            setOpenDayKey(null);
            openPlan(dayKey, mealType);
          }}
          onEdit={(plannedMealId, mealType) => {
            const dayKey = openDayKey;
            setOpenDayKey(null);
            openPlan(dayKey, mealType, plannedMealId);
          }}
        />
      )}
    </section>
  );
}

export default memo(CalendarScreen);
