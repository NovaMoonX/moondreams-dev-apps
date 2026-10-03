import { useState } from 'react';

import { Button, Calendar } from '@moondreamsdev/dreamer-ui/components';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import CounterRow from '@apps/a-list/components/calendar/CounterRow';
import DayPanel from '@apps/a-list/components/calendar/DayPanel';
import PosterCell from '@apps/a-list/components/calendar/PosterCell';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import { selectViewingsByDay } from '@apps/a-list/store/selectors';
import { getDayKey } from '@apps/a-list/utils/dayKeys';

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// The calendar's own cell padding, border and square size are cleared so a poster can run
// edge to edge in a 3:4 cell; PosterCell fills it absolutely.
const CALENDAR_STYLES = {
  monthGridClassName: 'gap-px',
  cellClassName:
    'relative aspect-[3/4] h-auto min-h-0 w-full overflow-hidden rounded-none p-0 bg-muted/40 hover:bg-muted focus:bg-muted',
  selectedCellClassName: 'bg-muted/40 text-foreground',
  todayCellClassName: 'border-0',
};

function CalendarScreen() {
  const { openOverlay } = useAListOverlay();
  const viewingsByDay = useAppSelector(selectViewingsByDay);
  const now = useNow();
  const [selectedDay, setSelectedDay] = useState(getTodayStart);
  const selectedDayKey = getDayKey(selectedDay.getTime());

  const openAdd = () =>
    openOverlay({ kind: 'add', destination: 'calendar', date: selectedDayKey });

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Calendar'
        action={
          <Button type='button' size='sm' onClick={openAdd}>
            + Add
          </Button>
        }
      />
      <CounterRow now={now} />
      <Calendar
        mode='single'
        size='auto'
        initialDate={selectedDay}
        onDateSelect={setSelectedDay}
        customStyles={CALENDAR_STYLES}
        renderCell={(date, isSelected, _isDisabled, isToday) => (
          <PosterCell
            date={date}
            viewings={viewingsByDay[getDayKey(date.getTime())] ?? []}
            isSelected={isSelected}
            isToday={isToday}
          />
        )}
      />
      <DayPanel
        day={selectedDay}
        viewings={viewingsByDay[selectedDayKey] ?? []}
        onAdd={openAdd}
      />
    </section>
  );
}

export default CalendarScreen;
