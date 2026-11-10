import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import LockedButton from '@/components/LockedButton';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HELM_COPY } from '@apps/helm/constants';
import {
  useCopyTimeZone,
  useDiscrepancy,
} from '@apps/helm/hooks/useDiscrepancy';
import {
  confirmCalendarRight,
  undoCalendarRight,
  type PreviousFact,
} from '@apps/helm/store/actions/factActions';
import type { SyncedRecord } from '@apps/helm/types';
import { getCopyValue } from '@apps/helm/utils/discrepancy';

/** The one muted line saying an email disagrees with this copy; nothing when it doesn't. */
function DiscrepancyLine({ record }: { record: SyncedRecord }) {
  const discrepancy = useDiscrepancy(record);
  if (!discrepancy) return null;
  return (
    <span className='text-muted-foreground block text-[13px] break-words'>
      {HELM_COPY.discrepancyTwo(
        discrepancy.field === 'place',
        discrepancy.value,
      )}
    </span>
  );
}

interface Confirmed {
  newFactId: string;
  previous: PreviousFact;
  value: string;
}

/** The sheet's part: the disagreement and "The calendar is right", then the line that says what that did, with its Undo. */
export function DiscrepancyBlock({ record }: { record: SyncedRecord }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOffline = useNetworkStatus() === 'offline';
  const discrepancy = useDiscrepancy(record);
  const timeZone = useCopyTimeZone();
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fail = (error: unknown) => {
    console.error('Helm calendar answer did not save', error);
    addToast({ title: HELM_COPY.calendarRightFailed, type: 'error' });
  };

  const confirm = async () => {
    if (!user || !discrepancy || isWorking) return;
    const value = getCopyValue(record, discrepancy.field, timeZone);
    if (value === null) return;
    setIsWorking(true);
    setNote(null);
    try {
      const result = await confirmCalendarRight(user.uid, {
        fact: discrepancy.fact,
        record,
        statement: HELM_COPY.calendarRightStatement(record.sealed.title),
        value,
      });
      if (result.kind === 'done') {
        setConfirmed({
          newFactId: result.newFactId,
          previous: result.previous,
          value,
        });
      } else if (result.kind === 'changed') {
        setNote(HELM_COPY.calendarRightChanged);
      }
    } catch (error) {
      fail(error);
    }
    setIsWorking(false);
  };

  const undo = async () => {
    if (!user || !confirmed || isWorking) return;
    setIsWorking(true);
    try {
      if (
        (await undoCalendarRight(
          user.uid,
          confirmed.newFactId,
          confirmed.previous,
        )) === 'done'
      ) {
        setConfirmed(null);
      }
    } catch (error) {
      fail(error);
    }
    setIsWorking(false);
  };

  const locked = (label: string) => (
    <LockedButton
      label={label}
      title={HELM_COPY.connectionsNeedConnection}
      size='sm'
    >
      <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
    </LockedButton>
  );

  if (confirmed) {
    return (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <p className='text-muted-foreground min-w-0 flex-1 text-[13px] text-pretty'>
          {HELM_COPY.calendarRightDone(confirmed.value)}
        </p>
        {isOffline ? (
          locked(HELM_COPY.undo)
        ) : (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            disabled={isWorking}
            onClick={() => void undo()}
          >
            {HELM_COPY.undo}
          </Button>
        )}
      </div>
    );
  }
  if (!discrepancy) return null;
  return (
    <div className='flex flex-col items-start gap-2'>
      <p className='text-foreground text-[15px] break-words'>
        {HELM_COPY.discrepancyTwo(
          discrepancy.field === 'place',
          discrepancy.value,
        )}
      </p>
      {isOffline ? (
        locked(HELM_COPY.calendarIsRight)
      ) : (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='relative after:absolute after:inset-x-0 after:-inset-y-2'
          disabled={isWorking}
          onClick={() => void confirm()}
        >
          {HELM_COPY.calendarIsRight}
        </Button>
      )}
      {note && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {note}
        </p>
      )}
    </div>
  );
}

export default DiscrepancyLine;
