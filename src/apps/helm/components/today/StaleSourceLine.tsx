import { TriangleAlert } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { formatUpdatedAt } from '@apps/helm/utils/synced';

interface StaleSourceLineProps {
  /** "Shopping list · Pinch". */
  label: string;
  lastOkAt: number | null;
  now: number;
}

/** Says a category has not been read lately, or not yet; the page never plans around it without this line. */
function StaleSourceLine({ label, lastOkAt, now }: StaleSourceLineProps) {
  return (
    <p className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
      <TriangleAlert className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
      <span className='min-w-0 break-words'>
        {label} ·{' '}
        {lastOkAt === null
          ? HELM_COPY.syncedWaiting
          : HELM_COPY.syncedStale(formatUpdatedAt(lastOkAt, now))}
      </span>
    </p>
  );
}

export default StaleSourceLine;
