import { useEffect, useRef, useSyncExternalStore } from 'react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { formatTime } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import ReadChips from '@apps/helm/components/home/ReadChips';
import ResultLines from '@apps/helm/components/home/ResultLines';
import { HELM_COPY } from '@apps/helm/constants';
import { useOnceVisible } from '@apps/helm/hooks/useOnceVisible';
import { isSorting, subscribeSorting } from '@apps/helm/queries/nomosMutations';
import {
  loadExecutionsById,
  markCaptureSeen,
} from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';
import { getHomeHeldLine } from '@apps/helm/utils/heldCaptures';

interface TurnCardProps {
  capture: OpenCapture;
  /** Messages that joined this turn, in order: each its own bubble, with one reply for them all. */
  joined?: OpenCapture[];
  /** On home only the newest turn says it was saved as written; a turn that waits or needs the person says so wherever it is. */
  showsOutcome: boolean;
  /** The chips of what was read, shown as they were sealed, with nothing to change. */
  showsReading: boolean;
  /** On home its reply card marks the turn seen when it is on screen; elsewhere the person has already opened it. */
  isOnHome: boolean;
  /** Under this turn's reply, the one-time line that an AI service reads what is said. */
  showsNotice: boolean;
}

/** What the person sent, as their bubble with its time, and under it what became of it. */
function LostResult({
  captureId,
  isMarking,
}: {
  captureId: string;
  isMarking: boolean;
}) {
  const { user } = useAuth();
  const line = useRef<HTMLParagraphElement>(null);
  useOnceVisible(line, isMarking && user !== null, async () => {
    if (!user) return;
    await markCaptureSeen(user.uid, captureId).catch((error: unknown) => {
      console.error('Helm turn was not marked seen', error);
      throw error;
    });
  });
  return (
    <p ref={line} className='text-muted-foreground pl-[30px] text-[13px]'>
      {HELM_COPY.unreadable}
    </p>
  );
}

function TurnCard({
  capture,
  joined = [],
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
  const heldLine =
    isReading || isSorted || capture.isUnreadable
      ? null
      : getHomeHeldLine(capture, showsOutcome);
  const executions = capture.executionIds.flatMap((id) => {
    const execution = executionsById.get(id);
    return execution ? [execution] : [];
  });
  // A turn that asked to sort the rest has already made something, and shows it while it waits.
  const hasResults = !capture.isUnreadable && capture.executionIds.length > 0;
  const missingKey = hasResults
    ? capture.executionIds.filter((id) => !executionsById.has(id)).join(',')
    : '';
  const uid = user?.uid;
  useEffect(() => {
    if (uid && missingKey) void loadExecutionsById(uid, missingKey.split(','));
  }, [uid, missingKey]);
  const lastMessage = joined.at(-1) ?? capture;
  const hasCard = hasResults && executions.length > 0;
  const hasLost =
    hasResults && missingKey.split(',').some((id) => failedIds.includes(id));
  return (
    <article className='flex flex-col items-end gap-1'>
      <div className='flex w-full flex-col items-end gap-1'>
        {[capture, ...joined].map((message, index, messages) =>
          message.isUnreadable ? (
            <p
              key={message.id}
              className='helm-card text-muted-foreground max-w-[84%] px-3.5 py-2.5 text-[15px] leading-[21px]'
            >
              {HELM_COPY.unreadable}
            </p>
          ) : (
            <p
              key={message.id}
              className={join(
                'bg-primary text-primary-foreground max-w-[84%] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap',
                index === messages.length - 1
                  ? 'rounded-[18px_18px_4px_18px]'
                  : 'rounded-[18px]',
              )}
            >
              {message.text}
            </p>
          ),
        )}
      </div>
      <time
        dateTime={new Date(lastMessage.createdAt).toISOString()}
        className='text-muted-foreground text-[13px] tabular-nums'
      >
        {formatTime(lastMessage.createdAt)}
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
        <LostResult
          captureId={capture.id}
          isMarking={isOnHome && capture.seenAt === null}
        />
      )}
      {import.meta.env.DEV && capture.screen && (
        <p className='text-muted-foreground text-[11px] tabular-nums'>
          {`screen ${capture.screen.view} · focus ${capture.screen.focus?.id ?? 'none'} · ${capture.screen.visible.length} visible`}
        </p>
      )}
      {heldLine !== null && (
        <p className='text-muted-foreground text-[13px]'>{heldLine}</p>
      )}
    </article>
  );
}

export default TurnCard;
