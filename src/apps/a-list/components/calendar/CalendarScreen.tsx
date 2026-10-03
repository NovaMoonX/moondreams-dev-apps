import { useState } from 'react';

import { Button, Calendar } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import CounterRow from '@apps/a-list/components/calendar/CounterRow';
import PosterCell from '@apps/a-list/components/calendar/PosterCell';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectViewingsByDay } from '@apps/a-list/store/selectors';
import { getDayKey } from '@apps/a-list/utils/dayKeys';

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// The calendar's own cell padding, border and square size are cleared so a poster can run edge to
// edge in a rounded 3:4 cell; PosterCell fills it absolutely and clips itself.
const CALENDAR_STYLES = {
  containerClassName: 'border-0 bg-transparent p-0 shadow-none',
  monthGridClassName: 'gap-1.5',
  cellClassName:
    'group relative aspect-[3/4] h-auto min-h-0 w-full rounded-xl border-0 p-0 bg-muted hover:bg-muted/70 focus:bg-muted',
  selectedCellClassName: 'bg-muted text-foreground',
  todayCellClassName: 'border-0',
};

function CalendarScreen() {
  const { openOverlay } = useAListOverlay();
  const viewingsByDay = useAppSelector(selectViewingsByDay);
  const now = useNow();
  const [selectedDay, setSelectedDay] = useState(getTodayStart);
  const selectedDayKey = getDayKey(selectedDay.getTime());

  const openAdd = () =>
    openOverlay({
      kind: 'add',
      destination: 'calendar',
      date: selectedDayKey,
      mode: 'single',
    });

  const handleDateSelect = (date: Date) => {
    setSelectedDay(date);
    openOverlay({ kind: 'day', dayKey: getDayKey(date.getTime()) });
  };

  const hasViewings = Object.keys(viewingsByDay).length > 0;

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Calendar'
        action={
          <Button type='button' size='sm' rounded='full' onClick={openAdd}>
            + Add
          </Button>
        }
      />
      <CounterRow now={now} />
      {!hasViewings && (
        <div className='border-primary/30 bg-primary/5 flex items-center gap-3 rounded-2xl border p-4'>
          <span className='text-4xl' aria-hidden='true'>
            🎬
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <p className='font-medium'>
              Your calendar is waiting for its first movie.
            </p>
            <Button type='button' size='sm' rounded='full' onClick={openAdd}>
              Add your first movie
            </Button>
          </div>
        </div>
      )}
      <Calendar
        mode='single'
        size='auto'
        className='mx-auto max-w-2xl'
        initialDate={selectedDay}
        onDateSelect={handleDateSelect}
        customStyles={CALENDAR_STYLES}
        renderCell={(date, isSelected, _isDisabled, isToday) => (
          <PosterCell
            date={date}
            viewings={viewingsByDay[getDayKey(date.getTime())] ?? []}
            isSelected={isSelected}
            isToday={isToday}
            now={now}
          />
        )}
      />
    </section>
  );
}

export default CalendarScreen;
