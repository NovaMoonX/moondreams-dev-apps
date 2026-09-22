import type { TripSpace } from '@apps/waypoint/types';

interface TripProgressBarProps {
  trip: TripSpace;
  now: number;
}

function TripProgressBar({ trip, now }: TripProgressBarProps) {
  const duration = trip.endDate - trip.startDate;
  const elapsed = duration > 0 ? (now - trip.startDate) / duration : 0;
  const progress = Math.min(1, Math.max(0, elapsed));

  return (
    <div
      role='progressbar'
      aria-label={`${trip.title} progress`}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className='bg-muted fixed inset-x-0 bottom-0 z-10 h-1'
    >
      <div
        className='bg-emerald-500 h-full transition-[width]'
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

export default TripProgressBar;
