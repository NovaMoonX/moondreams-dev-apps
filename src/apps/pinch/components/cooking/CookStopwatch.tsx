import { Clock } from 'lucide-react';

import useNow from '@/hooks/useNow';
import { formatClock, formatDuration } from '@/utils/durationUtils';

interface CookStopwatchProps {
  startedAt: number;
}

function CookStopwatch({ startedAt }: CookStopwatchProps) {
  const now = useNow(1000);
  const elapsedMs = Math.max(0, now - startedAt);
  const minutes = Math.floor(elapsedMs / 60_000);

  return (
    <p
      role='timer'
      aria-label={`Cooking for ${minutes === 0 ? 'under a minute' : formatDuration(minutes * 60)}`}
      className='text-muted-foreground flex h-10 shrink-0 items-center gap-1 text-sm font-medium tabular-nums'
    >
      <Clock aria-hidden='true' className='h-3.5 w-3.5 max-[359px]:hidden' />
      {formatClock(Math.floor(elapsedMs / 1000) * 1000)}
    </p>
  );
}

export default CookStopwatch;
