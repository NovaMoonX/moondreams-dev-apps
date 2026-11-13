import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { ANSWER_TEXT_MAX, HELM_COPY } from '@apps/helm/constants';
import AnswerField from '@apps/helm/components/home/AnswerField';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import ChoiceButton, {
  QUIET_CLASS,
} from '@apps/helm/components/home/ChoiceButton';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

/** The options as tall choices, then new and none quieter, and "Something else" opening a short field when the options may not cover it. */
function PickOneAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const name = useAssistantName();
  const [isElseOpen, setIsElseOpen] = useState(false);
  const [elseText, setElseText] = useState('');
  const choices = question.options.filter(
    (option) => option.id !== 'new' && option.id !== 'none',
  );
  const others = question.options.filter(
    (option) => option.id === 'new' || option.id === 'none',
  );
  const pick = (optionId: string) =>
    onAnswer({ shape: 'pickOne', optionId, otherText: null });

  return (
    <>
      {choices.map((option) => (
        <ChoiceButton
          key={option.id}
          label={option.label}
          detail={option.detail}
          isDisabled={isBusy}
          onClick={() => pick(option.id)}
        />
      ))}
      {isElseOpen && (
        <AnswerField
          label={HELM_COPY.questionSomethingElseField(name)}
          placeholder={HELM_COPY.questionSomethingElseField(name)}
          value={elseText}
          onChange={setElseText}
          maxLength={ANSWER_TEXT_MAX}
          isDisabled={isBusy}
          autoFocus
          onSend={() =>
            onAnswer({
              shape: 'pickOne',
              optionId: 'other',
              otherText: elseText.trim(),
            })
          }
        />
      )}
      {(others.length > 0 || (question.allowsSomethingElse && !isElseOpen)) && (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-3'>
          {others.map((option) => (
            <Button
              key={option.id}
              type='button'
              variant='tertiary'
              size='sm'
              className={QUIET_CLASS}
              disabled={isBusy}
              onClick={() => pick(option.id)}
            >
              {option.label}
            </Button>
          ))}
          {question.allowsSomethingElse && !isElseOpen && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className={QUIET_CLASS}
              disabled={isBusy}
              onClick={() => setIsElseOpen(true)}
            >
              {HELM_COPY.questionSomethingElse}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export default PickOneAnswer;
