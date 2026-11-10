import { useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import UndoButton from '@apps/helm/components/activity/UndoButton';
import ResultRows from '@apps/helm/components/home/ResultRows';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useOnceVisible } from '@apps/helm/hooks/useOnceVisible';
import {
  markAiNoticeSeen,
  markCaptureSeen,
} from '@apps/helm/store/actions/captureActions';
import { useResultLines } from '@apps/helm/hooks/useResultLines';
import { useUndoOf } from '@apps/helm/hooks/useUndoOf';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { useLinkedNames } from '@apps/helm/hooks/useLinkedNames';
import type { OpenExecution } from '@apps/helm/types';
import { readMadeEntities } from '@apps/helm/utils/resultLines';

interface ResultLinesProps {
  captureId: string;
  execution: OpenExecution;
  /** On home a turn is marked seen once its card is on screen, and the first one says that an AI service reads what is said. */
  isOnHome: boolean;
  isSeen: boolean;
  showsNotice: boolean;
}

const toSentence = (summary: string) =>
  /[?]$/.test(summary) ? summary : summary.replace(/[.!]*$/, '.');

function AiNotice() {
  const name = useAssistantName();
  const { user } = useAuth();
  const hasSeen = useAppSelector(
    (state) => state.helm.profile?.hasSeenAiNotice,
  );
  // Decided when the line first appears, so it stays while it is read and the profile then changes.
  const [isShown] = useState(hasSeen === false);
  const ref = useRef<HTMLParagraphElement>(null);
  useOnceVisible(ref, isShown && user !== null, async () => {
    if (!user) return;
    await markAiNoticeSeen(user.uid).catch((error: unknown) => {
      console.error('Helm AI notice was not marked seen', error);
      throw error;
    });
  });
  if (!isShown) return null;
  return (
    <p
      ref={ref}
      className='text-muted-foreground pl-[30px] text-[13px] text-pretty'
    >
      {HELM_COPY.aiNotice(name)}
    </p>
  );
}

function PeopleRow({ execution }: Pick<ResultLinesProps, 'execution'>) {
  const made = readMadeEntities(execution);
  const madeIds = new Set(made.map((entry) => entry.id));
  const others = useLinkedNames({
    whoIds: execution.linkedWhoIds.filter((id) => !madeIds.has(id)),
    placeIds: execution.linkedPlaceIds.filter((id) => !madeIds.has(id)),
  });
  const parts = [
    made.length > 0
      ? HELM_COPY.resultAdded(made.map((entry) => entry.name))
      : null,
    others.length > 0
      ? HELM_COPY.resultLinked(others.map((entry) => entry.name))
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className='border-border text-muted-foreground border-t px-3.5 py-2 text-[13px] break-words'>
      {parts.join(' · ')}
    </p>
  );
}

/** What the assistant said about a turn and the compact card of what it did, one row per change. */
function ResultLines({
  captureId,
  execution,
  isOnHome,
  isSeen,
  showsNotice,
}: ResultLinesProps) {
  const { user } = useAuth();
  const card = useRef<HTMLDivElement>(null);
  const lines = useResultLines(execution);
  const { undo } = useUndoOf(execution);
  const isUndone = execution.undoneByExecutionId !== null;
  const hasFoot = canUndo(execution) || isUndone;

  useOnceVisible(card, isOnHome && !isSeen && user !== null, async () => {
    if (!user) return;
    await markCaptureSeen(user.uid, captureId).catch((error: unknown) => {
      console.error('Helm turn was not marked seen', error);
      throw error;
    });
  });

  return (
    <div ref={card} className='flex w-full flex-col items-start gap-2'>
      {execution.isUnreadable ? (
        <p className='text-muted-foreground pl-[30px] text-[13px]'>
          {HELM_COPY.unreadable}
        </p>
      ) : (
        <>
          {execution.summary && (
            <AssistantLine>{toSentence(execution.summary)}</AssistantLine>
          )}
          {lines.length > 0 && (
            <div className='helm-card ml-[30px] w-[calc(100%-30px)] overflow-hidden'>
              <ResultRows execution={execution} lines={lines} undo={undo} />
              {!isUndone && <PeopleRow execution={execution} />}
              {hasFoot && (
                <div className='border-border flex items-baseline justify-between gap-3 border-t px-3.5 py-2'>
                  {isUndone ? (
                    <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
                      {undo?.undoReport ?? HELM_COPY.takenBackLabel}
                    </p>
                  ) : (
                    <UndoButton
                      execution={execution}
                      lineCount={lines.length}
                    />
                  )}
                  {!isUndone && (
                    <time
                      dateTime={new Date(execution.createdAt).toISOString()}
                      className='text-muted-foreground shrink-0 text-[13px] tabular-nums'
                    >
                      {formatTime(execution.createdAt)}
                    </time>
                  )}
                </div>
              )}
            </div>
          )}
          {isOnHome && showsNotice && <AiNotice />}
        </>
      )}
    </div>
  );
}

export default ResultLines;
