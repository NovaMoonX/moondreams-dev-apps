import { useEffect, useState } from 'react';

import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
import ActorMark from '@apps/helm/components/activity/ActorMark';
import UndoButton from '@apps/helm/components/activity/UndoButton';
import AnswerCard from '@apps/helm/components/home/AnswerCard';
import ResultRows from '@apps/helm/components/home/ResultRows';
import { HELM_COPY } from '@apps/helm/constants';
import { useResultLines } from '@apps/helm/hooks/useResultLines';
import { useUndoOf } from '@apps/helm/hooks/useUndoOf';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { loadCaptureWords } from '@apps/helm/store/actions/activityActions';
import {
  selectAllCaptures,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import type { CaptureAnswer, OpenExecution } from '@apps/helm/types';
import { getActivityLine } from '@apps/helm/utils/activity';
import { getJoinedOf } from '@apps/helm/utils/sessions';

interface ExecutionSheetProps {
  /** The execution to show, as it was when opened; null keeps the sheet closed. The live one in the store replaces it while it is there. */
  execution: OpenExecution | null;
  onClose: () => void;
}

/** The words an execution was made from and the answer it gave; empty when they are gone or won't open. */
function useCaptureTexts(captureId: string | null) {
  const { user } = useAuth();
  const captures = useAppSelector(selectAllCaptures);
  const stored = captures.find((capture) => capture.id === captureId);
  const [fetched, setFetched] = useState<{
    id: string;
    words: { text: string; answer: CaptureAnswer | null } | null;
  } | null>(null);
  const uid = user?.uid;
  const needsFetch = captureId !== null && !stored;

  useEffect(() => {
    if (!uid || !captureId || !needsFetch) return;
    let isCurrent = true;
    loadCaptureWords(uid, captureId)
      .then((words) => {
        if (isCurrent) setFetched({ id: captureId, words });
      })
      .catch((error: unknown) => {
        console.error('Helm turn did not load', error);
      });
    return () => {
      isCurrent = false;
    };
  }, [uid, captureId, needsFetch]);

  if (stored) {
    return {
      texts: [stored, ...getJoinedOf(stored, captures)].flatMap((message) =>
        message.isUnreadable || !message.text ? [] : [message.text],
      ),
      answer: stored.answer,
    };
  }
  const words = fetched?.id === captureId ? fetched.words : null;
  return { texts: words ? [words.text] : [], answer: words?.answer ?? null };
}

function SheetBody({ execution }: { execution: OpenExecution }) {
  const lines = useResultLines(execution);
  const { undo } = useUndoOf(execution);
  const { texts, answer } = useCaptureTexts(execution.captureId);

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2'>
        <ActorMark actor={execution.actor} />
        <p className='text-muted-foreground text-[13px] tabular-nums'>
          {HELM_COPY.sheetDayTime(
            formatDate(execution.createdAt),
            formatTime(execution.createdAt),
          )}
        </p>
      </div>
      {texts.map((text, index) => (
        <blockquote
          key={index}
          className='bg-muted text-muted-foreground rounded-[10px] px-3.5 py-2.5 text-[15px] leading-[21px] break-words whitespace-pre-wrap'
        >
          {text}
        </blockquote>
      ))}
      {execution.category === 'answer' && answer && (
        <AnswerCard answer={answer} />
      )}
      {lines.length > 0 && (
        <section className='space-y-1'>
          <h3 className='text-[13px] font-medium'>{HELM_COPY.sheetChanged}</h3>
          <ResultRows execution={execution} lines={lines} undo={undo} isFlat />
        </section>
      )}
    </div>
  );
}

function SheetFoot({ execution }: { execution: OpenExecution }) {
  const lines = useResultLines(execution);
  const { undo } = useUndoOf(execution);

  if (execution.category === 'undo') {
    return (
      <div className='px-6 pt-2 pb-6'>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {execution.undoReport ?? execution.summary}
        </p>
      </div>
    );
  }
  if (execution.undoneByExecutionId !== null) {
    return (
      <div className='px-6 pt-2 pb-6'>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {undo?.undoReport ?? HELM_COPY.takenBackLabel}
        </p>
      </div>
    );
  }
  if (!canUndo(execution)) return null;
  return (
    <div className='px-6 pt-2 pb-6'>
      <UndoButton execution={execution} lineCount={lines.length} isFull />
    </div>
  );
}

/** One entry of Activity: what was done, what it came from and what it changed, with its Undo. */
function ExecutionSheet({ execution: opened, onClose }: ExecutionSheetProps) {
  const byId = useAppSelector(selectExecutionsById);
  const execution = opened ? (byId.get(opened.id) ?? opened) : null;

  return (
    <DetailSheet
      isOpen={execution !== null}
      onClose={onClose}
      title={execution ? getActivityLine(execution) : ''}
      footer={execution && <SheetFoot execution={execution} />}
    >
      {execution && <SheetBody key={execution.id} execution={execution} />}
    </DetailSheet>
  );
}

export default ExecutionSheet;
