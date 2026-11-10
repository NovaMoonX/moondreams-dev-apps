import { useState, type ComponentType } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { QUIET_CLASS } from '@apps/helm/components/home/ChoiceButton';
import DateTimeAnswer from '@apps/helm/components/home/DateTimeAnswer';
import FreeTextAnswer from '@apps/helm/components/home/FreeTextAnswer';
import NumberAnswer from '@apps/helm/components/home/NumberAnswer';
import PickOneAnswer from '@apps/helm/components/home/PickOneAnswer';
import PickRecordAnswer from '@apps/helm/components/home/PickRecordAnswer';
import PickSeveralAnswer from '@apps/helm/components/home/PickSeveralAnswer';
import YesNoAnswer from '@apps/helm/components/home/YesNoAnswer';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import { skipQuestion } from '@apps/helm/store/actions/captureActions';
import { sendQuestionAnswer } from '@apps/helm/store/actions/questionActions';
import type { QuestionAnswerValue, QuestionShape } from '@apps/helm/types';
import type { OpenQuestion } from '@apps/helm/utils/heldCaptures';

interface QuestionCardProps {
  captureId: string;
  item: OpenQuestion;
  /** On a turn's card a skipped question says where it waits; in its own sheet it can still be answered, so it shows its choices. */
  isInSheet: boolean;
  /** The sheet that holds the question already shows its prompt as its title. */
  isPromptHidden?: boolean;
}

const PARTS: Record<QuestionShape, ComponentType<AnswerPartProps>> = {
  pickOne: PickOneAnswer,
  pickSeveral: PickSeveralAnswer,
  yesNo: YesNoAnswer,
  freeText: FreeTextAnswer,
  dateTime: DateTimeAnswer,
  pickRecord: PickRecordAnswer,
  number: NumberAnswer,
};

/** One open question in the shape that fits it, with Skip. A code-built question (which person or place) is answered on the server and needs a connection; one the assistant wrote is answered as a turn, which waits offline like any other. */
function QuestionCard({
  captureId,
  item,
  isInSheet,
  isPromptHidden = false,
}: QuestionCardProps) {
  const { user } = useAuth();
  const name = useAssistantName();
  const isOffline = useNetworkStatus() === 'offline';
  const [isWorking, setIsWorking] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { id, question, skippedAt } = item;
  const isSkipped = skippedAt !== null;
  const isModelWritten = question.builtBy === 'model';
  const Part = PARTS[question.shape];

  if (isSkipped && !isInSheet) {
    return (
      <p className='text-muted-foreground self-start pl-[30px] text-[13px] text-pretty'>
        {HELM_COPY.questionSkippedAbout(question.prompt)}
      </p>
    );
  }

  const answerAsTurn = async (
    value: QuestionAnswerValue,
    recordName: string | null,
  ) => {
    if (!user) return;
    setIsWorking(true);
    try {
      const { write } = await sendQuestionAnswer(user.uid, {
        captureId,
        questionId: id,
        question,
        value,
        transcript: null,
        recordName,
        assistantName: name,
      });
      setIsSent(true);
      write.catch(() => {
        setIsSent(false);
        setNote(HELM_COPY.heldActionFailed);
      });
    } catch (error) {
      console.error('Helm answer was not sent', error);
      setNote(HELM_COPY.heldActionFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const answerOnServer = async (value: QuestionAnswerValue) => {
    if (value.shape !== 'pickOne' || isOffline) return;
    setIsWorking(true);
    const result = await resolveQuestion(captureId, id, {
      by: 'tap',
      optionId: value.optionId,
    });
    setIsWorking(false);
    if (result.kind === 'offline') setNote(HELM_COPY.questionNeedsConnection);
    if (result.kind === 'gone') setNote(HELM_COPY.questionGone(question.kind));
    if (result.kind === 'failed') setNote(HELM_COPY.heldActionFailed);
  };

  const answer = (
    value: QuestionAnswerValue,
    recordName: string | null = null,
  ) => {
    if (isWorking || isSent) return;
    setNote(null);
    void (isModelWritten
      ? answerAsTurn(value, recordName)
      : answerOnServer(value));
  };

  const skip = () => {
    if (!user) return;
    skipQuestion(user.uid, captureId, id).catch((error: unknown) => {
      console.error('Helm question was not skipped', error);
      setNote(HELM_COPY.heldActionFailed);
    });
  };

  const message =
    isOffline && !isModelWritten ? HELM_COPY.questionNeedsConnection : note;

  return (
    <div className='flex w-full flex-col items-start gap-2'>
      {!isPromptHidden && <AssistantLine>{question.prompt}</AssistantLine>}
      <div
        className={join(
          'flex flex-col gap-2',
          isInSheet ? 'w-full' : 'ml-[30px] w-[calc(100%-30px)]',
        )}
      >
        {isSkipped && isInSheet && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.questionSkippedNote}
          </p>
        )}
        {isSent ? (
          <p
            className='text-muted-foreground text-[13px] text-pretty'
            role='status'
          >
            {HELM_COPY.questionSent}
          </p>
        ) : (
          <>
            <Part question={question} isBusy={isWorking} onAnswer={answer} />
            {!isSkipped && (
              <div className='flex flex-wrap items-center gap-x-3 gap-y-3'>
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className={join(QUIET_CLASS, 'text-muted-foreground!')}
                  disabled={isWorking}
                  onClick={skip}
                >
                  {HELM_COPY.questionSkip}
                </Button>
              </div>
            )}
          </>
        )}
        {message && (
          <p
            className='text-muted-foreground text-[13px] text-pretty'
            role='status'
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default QuestionCard;
