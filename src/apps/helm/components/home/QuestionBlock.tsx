import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import { HELM_COPY } from '@apps/helm/constants';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import { skipQuestion } from '@apps/helm/store/actions/captureActions';
import type { OpenQuestion } from '@apps/helm/utils/heldCaptures';

interface QuestionBlockProps {
  captureId: string;
  item: OpenQuestion;
  /** On a turn's card a skipped question says where it waits; in its own sheet it can still be answered, so it shows its choices. */
  isInSheet: boolean;
  /** The sheet that holds the question already shows its prompt as its title. */
  isPromptHidden?: boolean;
}

// A 28px button reaches 40px tall through its pseudo-element, which the 12px gaps leave clear.
const QUIET_CLASS =
  "relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']";

/** One open which-person or which-place question: the candidates as tall choices, then new and none quieter, and Skip. */
function QuestionBlock({
  captureId,
  item,
  isInSheet,
  isPromptHidden = false,
}: QuestionBlockProps) {
  const { user } = useAuth();
  const isOffline = useNetworkStatus() === 'offline';
  const [isWorking, setIsWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { id, question, skippedAt } = item;
  const isSkipped = skippedAt !== null;
  const candidates = question.options.filter((option) => option.ref !== null);
  const others = question.options.filter((option) => option.ref === null);

  if (isSkipped && !isInSheet) {
    return (
      <p className='text-muted-foreground pl-[30px] text-[13px] text-pretty'>
        {HELM_COPY.questionSkipped}
      </p>
    );
  }

  const answer = async (optionId: string) => {
    if (!user || isWorking || isOffline) return;
    setIsWorking(true);
    setNote(null);
    const result = await resolveQuestion(captureId, id, {
      by: 'tap',
      optionId,
    });
    setIsWorking(false);
    if (result.kind === 'offline') setNote(HELM_COPY.questionNeedsConnection);
    if (result.kind === 'gone') setNote(HELM_COPY.questionGone(question.kind));
    if (result.kind === 'failed') setNote(HELM_COPY.heldActionFailed);
  };

  const skip = () => {
    if (!user) return;
    skipQuestion(user.uid, captureId, id).catch((error: unknown) => {
      console.error('Helm question was not skipped', error);
      setNote(HELM_COPY.heldActionFailed);
    });
  };

  const message = isOffline ? HELM_COPY.questionNeedsConnection : note;

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
        {candidates.map((option) => (
          <Button
            key={option.id}
            type='button'
            variant='secondary'
            aria-label={HELM_COPY.questionOptionAria(
              option.label,
              option.detail,
            )}
            disabled={isWorking}
            className='h-auto min-h-[52px] w-full flex-col items-start justify-center gap-0 px-3.5 py-2.5 text-left'
            onClick={() => void answer(option.id)}
          >
            <span className='text-[15px] leading-[21px] break-words'>
              {option.label}
            </span>
            {option.detail && (
              <span className='text-muted-foreground text-[13px] break-words'>
                {option.detail}
              </span>
            )}
          </Button>
        ))}
        <div className='flex flex-wrap items-center gap-x-3 gap-y-3'>
          {others.map((option) => (
            <Button
              key={option.id}
              type='button'
              variant='tertiary'
              size='sm'
              className={QUIET_CLASS}
              disabled={isWorking}
              onClick={() => void answer(option.id)}
            >
              {option.label}
            </Button>
          ))}
          {!isSkipped && (
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
          )}
        </div>
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

export default QuestionBlock;
