import { formatClockTime } from '@/utils/formatUtils';
import type { LogisticsEntry } from '@apps/waypoint/utils/timelineLogistics';

function LogisticsRow({ entry }: { entry: LogisticsEntry }) {
  return (
    <div className='bg-muted/60 border-border/60 flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'>
      <span className='w-5 shrink-0 text-center' aria-hidden='true'>
        {entry.emoji}
      </span>
      <p className='min-w-0 flex-1 truncate' title={`${entry.verb} · ${entry.name}`}>
        <span className='font-medium'>{entry.verb}</span>
        <span className='text-muted-foreground'> · {entry.name}</span>
      </p>
      {entry.time && (
        <span className='text-muted-foreground shrink-0 text-xs whitespace-nowrap'>{formatClockTime(entry.time)}</span>
      )}
    </div>
  );
}

export default LogisticsRow;
