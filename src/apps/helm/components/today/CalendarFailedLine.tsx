import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CloudOff, RotateCw } from 'lucide-react';

import { syncConnections } from '@/lib/connections/connectionCalls';
import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { HELM_COPY } from '@apps/helm/constants';

interface CalendarFailedLineProps {
  /** The live calendar grants whose last read failed. */
  grants: ConnectionGrantWithId[];
  /** Whether the day has kept tasks to check against the calendar. */
  hasPlan: boolean;
}

/** Says the calendar couldn't be read and offers to read it again; the day is never shown as empty without it. */
function CalendarFailedLine({ grants, hasPlan }: CalendarFailedLineProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const retry = () => {
    setIsRetrying(true);
    setHasFailed(false);
    Promise.all(grants.map((grant) => syncConnections({ grantId: grant.id })))
      .catch((error: unknown) => {
        console.error('Helm calendar was not updated', error);
        setHasFailed(true);
      })
      .finally(() => setIsRetrying(false));
  };

  return (
    <div className='helm-card bg-muted/50 flex flex-wrap items-start gap-x-3 gap-y-2 p-4'>
      <CloudOff
        className='mt-0.5 size-4 shrink-0 text-[var(--helm-overdue)]'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1 space-y-1 max-[359px]:basis-[calc(100%-1.75rem)]'>
        <p className='text-foreground text-[15px] text-pretty'>
          {HELM_COPY.calendarFailedLine}
          {hasPlan && ` ${HELM_COPY.calendarFailedPlanned}`}
        </p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {hasFailed
            ? HELM_COPY.syncedNowFailed
            : HELM_COPY.calendarNoSuggestions}
        </p>
      </div>
      <Button
        type='button'
        variant='outline'
        size='sm'
        loading={isRetrying}
        className="relative shrink-0 after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[''] max-[359px]:ml-7"
        onClick={retry}
      >
        <RotateCw className='mr-1 size-3.5' aria-hidden='true' />
        {HELM_COPY.calendarTryAgain}
      </Button>
    </div>
  );
}

export default CalendarFailedLine;
