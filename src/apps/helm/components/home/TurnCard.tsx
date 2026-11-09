import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { formatTime } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import ReadChips from '@apps/helm/components/home/ReadChips';
import ResultLines from '@apps/helm/components/home/ResultLines';
import { HELM_COPY } from '@apps/helm/constants';
import { isSorting, subscribeSorting } from '@apps/helm/queries/nomosMutations';
import { loadExecutionsById } from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';

interface TurnCardProps {
  capture: OpenCapture;
  /** On home only the newest turn says what became of it, since every turn so far is kept the same way. */
  showsOutcome: boolean;
  /** The chips of what was read, shown as they were sealed, with nothing to change. */
  showsReading: boolean;
  /** On home its reply card marks the turn seen when it is on screen; elsewhere the person has already opened it. */
  isOnHome: boolean;
  /** Under this turn's reply, the one-time line that an AI service reads what is said. */
  showsNotice: boolean;
}

/** What the person sent, as their bubble with its time, and under it what became of it. */
function TurnCard({
  capture,
  showsOutcome,
  showsReading,
  isOnHome,
  showsNotice,
}: TurnCardProps) {
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const { user } = useAuth();
  const isCallOut = useSyncExternalStore(subscribeSorting, () =>
    isSorting(capture.id),
  );
  const isReading = isCallOut || capture.status === 'interpreting';
  const isSorted = capture.status === 'sorted' && !isReading;
  const executions = capture.executionIds.flatMap((id) => {
    const execution = executionsById.get(id);
    return execution ? [execution] : [];
  });
  const missingKey = isSorted
    ? capture.executionIds.filter((id) => !executionsById.has(id)).join(',')
    : '';
  const uid = user?.uid;
  useEffect(() => {
    if (uid && missingKey) void loadExecutionsById(uid, missingKey.split(','));
  }, [uid, missingKey]);
  const hasCard = isSorted && !capture.isUnreadable && executions.length > 0;
  const hasLost =
    isSorted &&
    !capture.isUnreadable &&
    missingKey.split(',').some((id) => failedIds.includes(id));
  return (
    <article className='flex flex-col items-end gap-1'>
      {capture.isUnreadable ? (
        <p className='helm-card text-muted-foreground max-w-[84%] px-3.5 py-2.5 text-[15px] leading-[21px]'>
          {HELM_COPY.unreadable}
        </p>
      ) : (
        <p className='bg-primary text-primary-foreground max-w-[84%] rounded-[18px_18px_4px_18px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'>
          {capture.text}
        </p>
      )}
      <time
        dateTime={new Date(capture.createdAt).toISOString()}
        className='text-muted-foreground text-[13px] tabular-nums'
      >
        {formatTime(capture.createdAt)}
      </time>
      {showsReading && !capture.isUnreadable && !hasCard && (
        <div className='flex max-w-[84%] justify-end'>
          <ReadChips
            reading={capture.reading}
            timeZone={profileZone ?? getDeviceTimeZone() ?? 'UTC'}
            onDismiss={null}
            onPickDay={null}
          />
        </div>
      )}
      {isReading && !capture.isUnreadable && (
        <div className='flex w-full flex-col items-start gap-2' role='status'>
          <AssistantLine isQuiet>{HELM_COPY.reading}</AssistantLine>
        </div>
      )}
      {hasCard && (
        <div className='flex w-full flex-col items-start gap-2'>
          {executions.map((execution) => (
            <ResultLines
              key={execution.id}
              captureId={capture.id}
              execution={execution}
              isOnHome={isOnHome}
              isSeen={capture.seenAt !== null}
              showsNotice={showsNotice}
            />
          ))}
        </div>
      )}
      {hasLost && (
        <p className='text-muted-foreground pl-[30px] text-[13px]'>
          {HELM_COPY.unreadable}
        </p>
      )}
      {showsOutcome && !isReading && !isSorted && !capture.isUnreadable && (
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.savedAsWritten}
        </p>
      )}
    </article>
  );
}

export default TurnCard;
