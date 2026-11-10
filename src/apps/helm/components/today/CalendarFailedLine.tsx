import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CloudOff, RotateCw } from 'lucide-react';

import { syncConnections } from '@/lib/connections/connectionCalls';
import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { HELM_COPY } from '@apps/helm/constants';

interface CalendarFailedLineProps {
  /** The live calendar grants whose last read failed. */
  grants: ConnectionGrantWithId[];
}

/** Says the calendar couldn't be read and offers to read it again; the day is never shown as empty without it. */
function CalendarFailedLine({ grants }: CalendarFailedLineProps) {
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
    <div className='helm-card bg-muted/50 space-y-2 p-4'>
      <div className='flex items-start gap-3'>
        <CloudOff
          className='text-muted-foreground mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <p className='text-muted-foreground min-w-0 flex-1 text-[15px] text-pretty'>
          {HELM_COPY.calendarFailedLine}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          loading={isRetrying}
          className="relative shrink-0 after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
          onClick={retry}
        >
          <RotateCw className='mr-1 size-3.5' aria-hidden='true' />
          {HELM_COPY.calendarTryAgain}
        </Button>
      </div>
      {hasFailed && (
        <p className='text-muted-foreground pl-7 text-[13px] text-pretty'>
          {HELM_COPY.syncedNowFailed}
        </p>
      )}
    </div>
  );
}

export default CalendarFailedLine;
