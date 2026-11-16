import { useState, type ComponentType } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { QUIET_CLASS } from '@apps/helm/components/home/ChoiceButton';
import DateTimeAnswer from '@apps/helm/components/home/DateTimeAnswer';
import FreeTextAnswer from '@apps/helm/components/home/FreeTextAnswer';
import NeitherAnswer from '@apps/helm/components/home/NeitherAnswer';
import NumberAnswer from '@apps/helm/components/home/NumberAnswer';
import PickOneAnswer from '@apps/helm/components/home/PickOneAnswer';
import PickRecordAnswer from '@apps/helm/components/home/PickRecordAnswer';
import PickSeveralAnswer from '@apps/helm/components/home/PickSeveralAnswer';
import WhichComesFirstAnswer from '@apps/helm/components/home/WhichComesFirstAnswer';
import YesNoAnswer from '@apps/helm/components/home/YesNoAnswer';
import ListeningStrip from '@apps/helm/components/voice/ListeningStrip';
import KeyDateSheet from '@apps/helm/components/who/KeyDateSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import {
  answerUndoOffer,
  takeBack,
} from '@apps/helm/store/actions/undoActions';
import {
  dismissQuestion,
  skipQuestion,
} from '@apps/helm/store/actions/captureActions';
import {
  isAnswerInFlight,
  sendQuestionAnswer,
} from '@apps/helm/store/actions/questionActions';
import type { QuestionAnswerValue, QuestionShape } from '@apps/helm/types';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { toQuestionChoice } from '@apps/helm/utils/questionChoice';
import {
  getOpenQuestions,
  isDismissable,
  type OpenQuestion,
} from '@apps/helm/utils/heldCaptures';

interface QuestionCardProps {
  captureId: string;
  item: OpenQuestion;
  /** On a turn's card a skipped question says where it waits; in its own sheet it can still be answered, so it shows its choices. */
  isInSheet: boolean;
  /** The sheet that holds the question already shows its prompt as its title. */
  isPromptHidden?: boolean;
  /** The words typed under "Neither", held by a sheet that must guard them when it closes; a card on its own keeps them itself. */
  neitherDraft?: { text: string; onChange: (text: string) => void };
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

/** The shapes that draw their own primary button, which Skip shares a row with. */
const OWN_PRIMARY: QuestionShape[] = [
  'pickSeveral',
  'number',
  'dateTime',
  'freeText',
];

/** One open question in the shape that fits it, with Answer later and Dismiss (which still shows once it waits in Needs you). A code-built question (which person or place) is answered on the server and needs a connection; one the assistant wrote is answered as a turn, which waits offline like any other. */
function QuestionCard({
  captureId,
  item,
  isInSheet,
  isPromptHidden = false,
  neitherDraft,
}: QuestionCardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [ownText, setOwnText] = useState('');
  const neitherText = neitherDraft?.text ?? ownText;
  const setNeitherText = neitherDraft?.onChange ?? setOwnText;
  const name = useAssistantName();
  const voice = useHelmVoiceContext();
  const isOffline = useNetworkStatus() === 'offline';
  const [isWorking, setIsWorking] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [isNeitherOpen, setIsNeitherOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const { id, question, skippedAt } = item;
  const dateId =
    question.kind === 'whichIsTrue'
      ? (question.options.find(
          (option) => option.ref?.collection === 'keyDates',
        )?.ref?.id ?? null)
      : null;
  const dateWho = useAppSelector((state) =>
    dateId === null
      ? null
      : (state.helm.who.items.find(
          (entry) => entry.id === question.aboutRef?.id && !entry.isUnreadable,
        ) ?? null),
  );
  const isSkipped = skippedAt !== null;
  const isModelWritten = question.builtBy === 'model';
  const Part =
    question.kind === 'whichComesFirst'
      ? WhichComesFirstAnswer
      : PARTS[question.shape];
  const skippedLine =
    question.kind === 'whichComesFirst'
      ? HELM_COPY.importanceWhichSkipped
      : HELM_COPY.questionSkipped;

  const answerAsTurn = async (
    value: QuestionAnswerValue,
    recordName: string | null,
  ) => {
    if (!user) return;
    setIsWorking(true);
    const tap = voice.followTap();
    try {
      const { write, id: sentId } = await sendQuestionAnswer(user.uid, {
        captureId,
        questionId: id,
        question,
        value,
        transcript: null,
        recordName,
        assistantName: name,
        isSpokenTurn: tap.isSpokenTurn,
      });
      tap.onSent({ id: sentId, write }, { captureId, questionId: id });
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

  const answerOnServer = async (value: QuestionAnswerValue, text?: string) => {
    const kinChoice =
      value.shape === 'pickRecord' ? toQuestionChoice(question, value) : null;
    if (
      (value.shape !== 'pickOne' &&
        value.shape !== 'pickSeveral' &&
        value.shape !== 'yesNo' &&
        kinChoice === null) ||
      isOffline
    )
      return;
    setIsWorking(true);
    const result = await resolveQuestion(
      captureId,
      id,
      kinChoice
        ? { by: 'tap', ...kinChoice }
        : value.shape === 'pickSeveral'
          ? { by: 'tap', optionIds: value.optionIds }
          : {
              by: 'tap',
              optionId:
                value.shape === 'pickOne' || value.shape === 'yesNo'
                  ? value.optionId
                  : '',
              ...(text !== undefined && { text }),
            },
    );
    setIsWorking(false);
    if (result.kind === 'done' && result.executionId && isInSheet && user) {
      const { uid } = user;
      const { executionId } = result;
      const optionId =
        value.shape === 'pickOne' || value.shape === 'yesNo'
          ? value.optionId
          : null;
      const kept = question.options.find((option) => option.id === optionId);
      const title =
        question.kind !== 'whichIsTrue'
          ? HELM_COPY.questionAnswered
          : optionId === 'none' || !kept
            ? HELM_COPY.factKeptNeither
            : HELM_COPY.factKept(kept.label);
      addToast({
        title,
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void takeBack(uid, executionId).then((undone) => {
              if (undone.kind === 'offline') {
                addToast({
                  title: HELM_COPY.undoNeedsConnectionTitle,
                  description: HELM_COPY.undoNeedsConnectionBody,
                  type: 'error',
                });
              }
            }),
        },
      });
    }
    const failure =
      result.kind === 'offline'
        ? HELM_COPY.questionNeedsConnection
        : result.kind === 'gone' || result.kind === 'stale'
          ? HELM_COPY.questionGone(question.kind)
          : result.kind === 'failed'
            ? HELM_COPY.heldActionFailed
            : null;
    setNote(failure);
  };

  const answerUndoOfferOnCard = async (optionId: string) => {
    if (!user || isOffline) return;
    setIsWorking(true);
    try {
      const outcome = await answerUndoOffer(user.uid, {
        captureId,
        questionId: id,
        question,
        optionId,
        by: 'tap',
      });
      setNote(
        outcome.kind === 'undone'
          ? outcome.report
          : outcome.kind === 'kept'
            ? optionId === 'keep'
              ? HELM_COPY.undoOfferKeptAll
              : HELM_COPY.undoOfferKept
            : outcome.kind === 'already'
              ? HELM_COPY.questionGone('undoOffer')
              : outcome.kind === 'nothing'
                ? (outcome.report ?? HELM_COPY.cannotTakeBack)
                : outcome.kind === 'offline'
                  ? HELM_COPY.questionNeedsConnection
                  : HELM_COPY.heldActionFailed,
      );
    } catch (error) {
      console.error('Helm undo offer was not answered', error);
      setNote(HELM_COPY.heldActionFailed);
    } finally {
      setIsWorking(false);
    }
  };

  const answer = (
    value: QuestionAnswerValue,
    recordName: string | null = null,
  ) => {
    if (isWorking || isSent || isAnswerInFlight(captureId, id)) return;
    setNote(null);
    if (
      question.kind === 'whichIsTrue' &&
      value.shape === 'pickOne' &&
      value.optionId === 'none'
    ) {
      if (dateId !== null && dateWho) setIsDateOpen(true);
      else setIsNeitherOpen(true);
      return;
    }
    if (
      question.kind === 'undoOffer' &&
      (value.shape === 'pickOne' || value.shape === 'yesNo')
    ) {
      void answerUndoOfferOnCard(value.optionId);
      return;
    }
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

  const skipButton = (
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
  );

  const dismiss = () => {
    if (!user) return;
    const capture = selectAllCaptures(store.getState()).find(
      (entry) => entry.id === captureId,
    );
    const isLastOpen =
      capture !== undefined &&
      getOpenQuestions(capture).every((entry) => entry.id === id);
    dismissQuestion(user.uid, captureId, id, isLastOpen).catch(
      (error: unknown) => {
        console.error('Helm question was not dismissed', error);
        setNote(HELM_COPY.heldActionFailed);
      },
    );
  };

  const dismissButton = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      className={join(QUIET_CLASS, 'text-muted-foreground!')}
      disabled={isWorking}
      onClick={dismiss}
    >
      {HELM_COPY.questionDismiss}
    </Button>
  );

  const canDismiss = isDismissable(question.kind);

  const quietActions = (
    <>
      {!isSkipped && skipButton}
      {canDismiss && dismissButton}
    </>
  );

  if (isSkipped && !isInSheet) {
    return (
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 self-start pl-[30px]'>
        <p className='text-muted-foreground text-left text-[13px] text-pretty'>
          {skippedLine}
        </p>
        {canDismiss && dismissButton}
        {note && (
          <p
            className='text-muted-foreground w-full text-[13px] text-pretty'
            role='status'
          >
            {note}
          </p>
        )}
      </div>
    );
  }

  const message =
    isOffline && !isModelWritten ? HELM_COPY.questionNeedsConnection : note;

  return (
    <div className='flex w-full flex-col items-start gap-2'>
      {isPromptHidden && question.lead !== null && (
        <p className='text-muted-foreground text-left text-[13px] text-pretty'>
          {question.lead}
        </p>
      )}
      {!isPromptHidden && (
        <AssistantLine>
          {question.lead === null
            ? question.prompt
            : `${question.lead} ${question.prompt}`}
        </AssistantLine>
      )}
      <div
        className={join(
          'flex flex-col gap-2',
          isInSheet ? 'w-full' : 'ml-[30px] w-[calc(100%-30px)]',
        )}
      >
        {isSkipped && isInSheet && (
          <p className='text-muted-foreground text-left text-[13px] text-pretty'>
            {skippedLine}
          </p>
        )}
        {isSent || isAnswerInFlight(captureId, id) ? (
          <p
            className='text-muted-foreground text-[13px] text-pretty'
            role='status'
          >
            {isOffline
              ? HELM_COPY.questionSavedOffline
              : HELM_COPY.questionSent}
          </p>
        ) : isNeitherOpen ? (
          <NeitherAnswer
            isBusy={isWorking}
            text={neitherText}
            onTextChange={setNeitherText}
            onSave={(text) =>
              void answerOnServer(
                { shape: 'pickOne', optionId: 'none', otherText: null },
                text,
              )
            }
            onBack={() => {
              setNeitherText('');
              setNote(null);
              setIsNeitherOpen(false);
            }}
          />
        ) : (
          <>
            <Part
              question={question}
              isBusy={isWorking}
              skip={quietActions}
              onAnswer={answer}
            />
            {!OWN_PRIMARY.includes(question.shape) && (
              <div className='flex flex-wrap items-center gap-x-3 gap-y-3'>
                {quietActions}
              </div>
            )}
          </>
        )}
        {!isInSheet && !isSent && (
          <ListeningStrip
            captureId={captureId}
            questionId={id}
            question={question}
          />
        )}
        {isDateOpen && dateId !== null && dateWho && !dateWho.isUnreadable && (
          <KeyDateSheet
            who={dateWho}
            openId={dateId}
            isAdding={false}
            startsEditing
            onSaved={() =>
              void answerOnServer({
                shape: 'pickOne',
                optionId: 'none',
                otherText: null,
              })
            }
            onClose={() => setIsDateOpen(false)}
          />
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
