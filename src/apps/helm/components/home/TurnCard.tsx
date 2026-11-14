import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { RotateCw } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import { formatTime } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import AnswerCard from '@apps/helm/components/home/AnswerCard';
import AnsweredQuestion from '@apps/helm/components/home/AnsweredQuestion';
import MediaLine, { TurnPhotos } from '@apps/helm/components/home/MediaLine';
import QuestionCard from '@apps/helm/components/home/QuestionCard';
import ReadChips from '@apps/helm/components/home/ReadChips';
import ResultLines from '@apps/helm/components/home/ResultLines';
import { HELM_COPY, QUESTIONS_PER_TURN } from '@apps/helm/constants';
import { useOnceVisible } from '@apps/helm/hooks/useOnceVisible';
import { isSorting, subscribeSorting } from '@apps/helm/queries/nomosMutations';
import {
  loadExecutionsById,
  markCaptureSeen,
  retryCapture,
} from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';
import {
  getAnsweredQuestions,
  getHomeHeldLine,
  getOpenQuestions,
  toHeldKind,
} from '@apps/helm/utils/heldCaptures';
import { formatDayName, toDayKey } from '@apps/helm/utils/planDays';

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
  const planDay = useAppSelector((state) =>
    capture.planDayKey
      ? state.helm.planDays.byId[capture.planDayKey]
      : undefined,
  );
  const now = useNow(60_000);
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const { user } = useAuth();
  const isCallOut = useSyncExternalStore(subscribeSorting, () =>
    isSorting(capture.id),
  );
  const { addToast } = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const isOffline = useNetworkStatus() === 'offline';
  const isReading =
    isCallOut ||
    (isRetrying && !isOffline && !capture.hasPendingWrites) ||
    capture.status === 'interpreting';
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
  const openQuestions = capture.isUnreadable ? [] : getOpenQuestions(capture);
  const unskipped = openQuestions.filter((entry) => entry.skippedAt === null);
  const questions = [
    ...unskipped,
    ...openQuestions.filter((entry) => entry.skippedAt !== null),
  ].slice(0, QUESTIONS_PER_TURN);
  const answered = capture.isUnreadable ? [] : getAnsweredQuestions(capture);
  const planLine = getPlanLine();
  const lastMessage = joined.at(-1) ?? capture;
  const hasCard = hasResults && executions.length > 0;
  const isQuietAnswer =
    isSorted &&
    capture.answersQuestion !== null &&
    capture.executionIds.length === 0 &&
    !capture.answer &&
    !capture.planDayKey;
  const hasNothingShown =
    !capture.isUnreadable &&
    (isSorted || capture.status === 'needsYou') &&
    capture.executionIds.length === 0 &&
    !capture.answer &&
    !capture.planDayKey &&
    heldLine === null &&
    openQuestions.length === 0;
  const quietLine = isQuietAnswer
    ? (capture.line ?? HELM_COPY.answerNoted)
    : hasNothingShown
      ? capture.line
      : null;
  const heldKind = toHeldKind(capture);
  const canRetry =
    heldLine !== null && (heldKind === 'failed' || heldKind === 'couldNotRead');
  const retry = async () => {
    if (!user) return;
    setIsRetrying(true);
    try {
      await retryCapture(user.uid, capture);
    } catch (error) {
      console.error('Helm turn was not read again', error);
      addToast({ title: HELM_COPY.heldActionFailed, type: 'error' });
    } finally {
      setIsRetrying(false);
    }
  };
  const hasLost =
    hasResults && missingKey.split(',').some((id) => failedIds.includes(id));
  function getPlanLine() {
    if (!isSorted || capture.isUnreadable || !capture.planDayKey) return null;
    if (hasResults || capture.answer) return null;
    const dayName = formatDayName(
      capture.planDayKey,
      toDayKey(now, profileZone ?? getDeviceTimeZone() ?? 'UTC'),
    );
    if (!planDay || (planDay.generatedAt ?? 0) < (capture.sortedAt ?? 0)) {
      return HELM_COPY.planningDay(dayName);
    }
    const count = Object.values(planDay.slots).filter(
      (slot) => slot.status === 'suggested',
    ).length;
    return count === 0
      ? HELM_COPY.planNothingFits
      : HELM_COPY.plannedDay(dayName, count);
  }
  return (
    <article className='flex flex-col items-end gap-1'>
      {!capture.isUnreadable && <TurnPhotos capture={capture} />}
      <div className='flex w-full flex-col items-end gap-1'>
        {[capture, ...joined]
          .filter((message) => message.isUnreadable || message.text !== '')
          .map((message, index, messages) =>
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
      {capture.arrivedVia === 'dropBox' && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.arrivedViaDropBox}
        </p>
      )}
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
          <AssistantLine isQuiet>
            {joined.length > 0
              ? HELM_COPY.readingSeveral(joined.length + 1)
              : HELM_COPY.reading}
          </AssistantLine>
          {showsOutcome && isOnHome && (
            <p className='text-muted-foreground pl-[30px] text-[13px] text-pretty'>
              {HELM_COPY.keepTyping}
            </p>
          )}
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
      {!capture.isUnreadable && capture.attachmentIds.length > 0 && (
        <div className='flex w-full flex-col items-start gap-2'>
          {capture.attachmentIds.map((id) => (
            <MediaLine key={id} capture={capture} mediaId={id} />
          ))}
        </div>
      )}
      {planLine !== null && (
        <div className='flex w-full flex-col items-start gap-2' role='status'>
          <AssistantLine>{planLine}</AssistantLine>
        </div>
      )}
      {quietLine !== null && (
        <div className='flex w-full flex-col items-start gap-2' role='status'>
          <AssistantLine>{quietLine}</AssistantLine>
        </div>
      )}
      {capture.answer && !capture.isUnreadable && (
        <AnswerCard answer={capture.answer} isInset capture={capture} />
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
      {answered.map((entry) => (
        <AnsweredQuestion
          key={entry.id}
          question={entry.question}
          answer={entry.answer}
        />
      ))}
      {questions.length > 0 && (
        <div className='mt-2 flex w-full flex-col items-start gap-8'>
          {questions.map((entry) => (
            <QuestionCard
              key={entry.id}
              captureId={capture.id}
              item={entry}
              isInSheet={false}
            />
          ))}
        </div>
      )}
      {openQuestions.length > questions.length && (
        <p className='text-muted-foreground pl-[30px] text-[13px] text-pretty'>
          {HELM_COPY.questionMore(openQuestions.length - questions.length)}
        </p>
      )}
      {heldLine !== null && !canRetry && (
        <p className='text-muted-foreground text-[13px]'>{heldLine}</p>
      )}
      {canRetry && (
        <div className='flex flex-wrap items-center justify-end gap-x-1'>
          <p className='text-muted-foreground text-[13px]'>{heldLine}</p>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='relative -mr-2 gap-1 text-[13px] before:absolute before:inset-x-0 before:-inset-y-2 before:content-[""]'
            onClick={() => void retry()}
          >
            <RotateCw className='size-3.5' aria-hidden='true' />
            {HELM_COPY.tryReadingAgain}
          </Button>
        </div>
      )}
    </article>
  );
}

export default TurnCard;
