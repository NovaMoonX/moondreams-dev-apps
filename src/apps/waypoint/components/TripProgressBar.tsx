import { Flag } from 'lucide-react';

import { getDayCount, getDayIndex } from '@/utils/dateRangeUtils';

import type { TripSpace } from '@apps/waypoint/types';

interface TripProgressBarProps {
  trip: TripSpace;
  now: number;
}

function TripProgressBar({ trip, now }: TripProgressBarProps) {
  const duration = trip.endDate - trip.startDate;
  const elapsed = duration > 0 ? (now - trip.startDate) / duration : 0;
  const progress = Math.min(1, Math.max(0, elapsed));
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const currentDay = Math.min(dayCount, Math.max(1, getDayIndex(trip.startDate, now) + 1));

  return (
    <div className='mx-auto flex max-w-4xl items-center gap-2.5 px-4 py-1.5'>
      <span className='text-muted-foreground text-[11px] font-medium whitespace-nowrap tabular-nums'>
        Day {currentDay} of {dayCount}
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
      <Flag aria-hidden className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
    </div>
  );
}

export default TripProgressBar;
