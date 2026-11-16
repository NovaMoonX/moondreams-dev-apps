import { useEffect, useState } from 'react';

import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { formatDate, formatTime } from '@/utils/formatUtils';
import ActorMark from '@apps/helm/components/activity/ActorMark';
import UndoChoices from '@apps/helm/components/activity/UndoChoices';
import UndoButton from '@apps/helm/components/activity/UndoButton';
import UndoPickActions from '@apps/helm/components/activity/UndoPickActions';
import AnswerCard from '@apps/helm/components/home/AnswerCard';
import ResultRows from '@apps/helm/components/home/ResultRows';
import { HELM_COPY } from '@apps/helm/constants';
import { useResultLines } from '@apps/helm/hooks/useResultLines';
import { useUndoChoices } from '@apps/helm/hooks/useUndoChoices';
import { useUndosOf } from '@apps/helm/hooks/useUndosOf';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { loadCaptureWords } from '@apps/helm/store/actions/activityActions';
import {
  selectEveryCapture,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import {
  selectPlacesById,
  selectWhoById,
} from '@apps/helm/store/selectors/whoSelectors';
import type { CaptureAnswer, OpenExecution } from '@apps/helm/types';
import { getActivityLine } from '@apps/helm/utils/activity';
import { describeYourAnswer } from '@apps/helm/utils/questionAnswers';
import { getJoinedOf } from '@apps/helm/utils/sessions';

interface ExecutionSheetProps {
  /** The execution to show, as it was when opened; null keeps the sheet closed. The live one in the store replaces it while it is there. */
  execution: OpenExecution | null;
  onClose: () => void;
}

/** The words an execution was made from and the answer it gave; empty when they are gone or won't open. */
function useCaptureTexts(captureId: string | null) {
  const { user } = useAuth();
  const captures = useAppSelector(selectEveryCapture);
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

/** The question an execution's effect came from and the answer kept with it; null when the turn that asked it is not loaded or the question was not answered. */
function useAskedQuestion(execution: OpenExecution) {
  const captures = useAppSelector(selectEveryCapture);
  const who = useAppSelector(selectWhoById);
  const places = useAppSelector(selectPlacesById);
  const ref = execution.questionRef;
  const question = ref
    ? captures.find((capture) => capture.id === ref.captureId)?.questions[
        ref.questionId
      ]
    : undefined;
  if (!question?.answer) return null;
  const { answer } = question;
  const recordName =
    answer.shape === 'pickRecord' && answer.ref
      ? ((answer.ref.collection === 'who'
          ? who.get(answer.ref.id)?.name
          : places.get(answer.ref.id)?.name) ?? null)
      : null;
  return {
    prompt: question.prompt,
    words: describeYourAnswer(question, answer, recordName),
  };
}

/** The sheet's unticked choices while the person picks what to undo; the sheet holds them since its body and its foot both read them. */
interface PickState {
  kept: Set<string>;
  onKeptChange: (kept: Set<string>) => void;
  isBusy: boolean;
  onBusyChange: (isBusy: boolean) => void;
  onStop: () => void;
}

function SheetBody({
  execution,
  pick,
}: {
  execution: OpenExecution;
  pick: PickState | null;
}) {
  const lines = useResultLines(execution);
  const { choices } = useUndoChoices(execution);
  const asked = useAskedQuestion(execution);
  const { undos } = useUndosOf(execution);
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
      {asked && (
        <p className='text-[13px] leading-[19px] text-pretty break-words'>
          {HELM_COPY.questionAsked(asked.prompt)}
          <span className='text-muted-foreground'>{` · ${asked.words}`}</span>
        </p>
      )}
      {execution.category === 'answer' && answer && (
        <AnswerCard answer={answer} />
      )}
      {pick && (
        <section className='space-y-1'>
          <h3 className='text-[13px] font-medium'>{HELM_COPY.undoPickTitle}</h3>
          <UndoChoices
            units={choices}
            picked={
              new Set(
                choices.flatMap((c) => (pick.kept.has(c.key) ? [] : [c.key])),
              )
            }
            onChange={(next) =>
              pick.onKeptChange(
                new Set(
                  choices.flatMap((c) => (next.has(c.key) ? [] : [c.key])),
                ),
              )
            }
            isBusy={pick.isBusy}
          />
        </section>
      )}
      {!pick && lines.length > 0 && (
        <section className='space-y-1'>
          <h3 className='text-[13px] font-medium'>{HELM_COPY.sheetChanged}</h3>
          <ResultRows
            execution={execution}
            lines={lines}
            undos={undos}
            isFlat
          />
        </section>
      )}
    </div>
  );
}

function SheetFoot({
  execution,
  pick,
  onPick,
}: {
  execution: OpenExecution;
  pick: PickState | null;
  onPick: () => void;
}) {
  const { units, choices } = useUndoChoices(execution);
  const { latest: undo } = useUndosOf(execution);
  const isPartlyUndone =
    execution.undoneByExecutionId === null && execution.partUndoIds.length > 0;

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
  if (pick) {
    return (
      <div className='px-6 pt-2 pb-6'>
        <UndoPickActions
          execution={execution}
          units={units}
          picked={
            new Set(
              choices.flatMap((c) => (pick.kept.has(c.key) ? [] : [c.key])),
            )
          }
          isBusyChange={pick.onBusyChange}
          onCancel={pick.onStop}
          onDone={pick.onStop}
        />
      </div>
    );
  }
  return (
    <div className='space-y-2 px-6 pt-2 pb-6'>
      {isPartlyUndone && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {undo?.undoReport ?? HELM_COPY.partlyTakenBackLabel}
        </p>
      )}
      <UndoButton
        execution={execution}
        unitCount={units.length}
        onPick={onPick}
        isFull
      />
    </div>
  );
}

/** One entry of Activity: what was done, what it came from and what it changed, with its Undo. */
function ExecutionSheet({ execution: opened, onClose }: ExecutionSheetProps) {
  const byId = useAppSelector(selectExecutionsById);
  const execution = opened ? (byId.get(opened.id) ?? opened) : null;
  const [isPicking, setIsPicking] = useState(false);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const stop = () => {
    setIsPicking(false);
    setKept(new Set());
  };
  useBackStep(isPicking, stop);
  const pick: PickState | null = isPicking
    ? {
        kept,
        onKeptChange: setKept,
        isBusy,
        onBusyChange: setIsBusy,
        onStop: stop,
      }
    : null;

  return (
    <DetailSheet
      isOpen={execution !== null}
      onClose={() => {
        stop();
        onClose();
      }}
      title={execution ? getActivityLine(execution) : ''}
      footer={
        execution && (
          <SheetFoot
            execution={execution}
            pick={pick}
            onPick={() => setIsPicking(true)}
          />
        )
      }
    >
      {execution && (
        <SheetBody key={execution.id} execution={execution} pick={pick} />
      )}
    </DetailSheet>
  );
}

export default ExecutionSheet;
