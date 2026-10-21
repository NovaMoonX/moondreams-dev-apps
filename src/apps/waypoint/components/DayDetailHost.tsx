import { useImperativeHandle, useState, type Ref } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import { getBucketLabel, getDayCount } from '@/utils/dateRangeUtils';
import { formatClockTime } from '@/utils/formatUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import type { LogisticsEntry } from '@apps/waypoint/utils/timelineLogistics';
import { getEventTime } from '@apps/waypoint/utils/tripTime';

export interface DayDetailHandle {
  open: (dayIndex: number) => void;
}

interface DayDetailHostProps {
  trip: TripSpace;
  events: TimelineEvent[];
  logisticsByDay: Map<number, LogisticsEntry[]>;
  handleRef: Ref<DayDetailHandle>;
  onAdd: (dayIndex: number) => void;
}

// Its open state lives here, not in the timeline, so a tap doesn't re-render every day of a big trip.
function DayDetailHost({ trip, events, logisticsByDay, handleRef, onAdd }: DayDetailHostProps) {
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  useImperativeHandle(handleRef, () => ({ open: setDayIndex }), []);

  const rows =
    dayIndex === null
      ? []
      : [
          ...events
            .filter((event) => !event.isArchived)
            .map((event) => ({ key: event.id, time: getEventTime(trip, event), title: event.title }))
            .filter(({ time }) => time.dayIndex === dayIndex)
            .map(({ key, time, title }) => ({ key, time: time.startTime ?? '', title })),
          ...(logisticsByDay.get(dayIndex) ?? []).map((entry) => ({
            key: entry.key,
            time: entry.time ?? '',
            title: `${entry.verb} ${entry.name}`,
          })),
        ].sort((first, second) => first.time.localeCompare(second.time));

  const handleAdd = () => {
    if (dayIndex === null) return;
    setDayIndex(null);
    onAdd(dayIndex);
  };

  return (
    <DetailSheet
      isOpen={dayIndex !== null}
      onClose={() => setDayIndex(null)}
      title={dayIndex === null ? 'Day' : getBucketLabel(dayIndex, trip.startDate, getDayCount(trip.startDate, trip.endDate))}
      footer={
        <div>
          <Button type='button' size='lg' className='w-full' onClick={handleAdd}>
            Add to this day
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>Nothing is planned this day yet.</p>
      ) : (
        <ul className='divide-border divide-y'>
          {rows.map((row) => (
            <li key={row.key} className='flex gap-3 py-2 text-sm'>
              <span className='text-muted-foreground w-20 shrink-0 whitespace-nowrap'>
                {row.time ? formatClockTime(row.time) : 'Any time'}
              </span>
              <span className='min-w-0'>{row.title}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailSheet>
  );
}

export default DayDetailHost;
