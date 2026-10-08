import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Flag } from 'lucide-react';

import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';

import type { TripSpace } from '@apps/waypoint/types';

interface TripProgressBarProps {
  trip: TripSpace;
  now: number;
}

function TripProgressBar({ trip, now }: TripProgressBarProps) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const dayIndex = getLocalDayIndex(trip.startDate, now);
  const today = new Date(now);
  const fractionOfDay = (today.getHours() * 60 + today.getMinutes()) / 1440;
  const progress = Math.min(1, Math.max(0, (dayIndex + fractionOfDay) / dayCount));
  const currentDay = Math.min(dayCount, Math.max(1, dayIndex + 1));
  const isComplete = dayIndex >= dayCount;

  return (
    <div className='mx-auto flex w-full max-w-4xl items-center gap-2.5 px-4 py-1.5'>
      <span className='text-muted-foreground text-[11px] font-medium whitespace-nowrap tabular-nums'>
        {isComplete ? 'Trip complete' : `Day ${currentDay} of ${dayCount}`}
      </span>
      <div
        role='progressbar'
        aria-label={`${trip.title} progress`}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className='bg-muted relative h-1 flex-1 rounded-full'
      >
        <div
          className='h-full rounded-full bg-emerald-500 transition-[width]'
          style={{ width: `${progress * 100}%` }}
        />
        <span
          aria-hidden
          className='ring-background absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-sm ring-2 transition-[left]'
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <Flag
        aria-hidden
        className={join(
          'h-3.5 w-3.5 shrink-0',
          isComplete ? 'fill-emerald-500 text-emerald-600' : 'text-muted-foreground',
        )}
      />
    </div>
  );
}

export default TripProgressBar;
