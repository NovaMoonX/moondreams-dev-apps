import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import ChoiceButton from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';

const NONE_ID = 'none';

/** Tall choices that tick on and off; "None of these" clears the others and any tick clears it, and Done sends what is ticked. */
function PickSeveralAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const choices = question.options.filter((option) => option.id !== NONE_ID);
  const hasNone = question.options.some((option) => option.id === NONE_ID);
  const toggle = (id: string) => {
    setHint(null);
    setPicked((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current.filter((entry) => entry !== NONE_ID), id],
    );
  };
  const done = () => {
    if (picked.length === 0) {
      setHint(HELM_COPY.questionPickAtLeastOne);
      return;
    }
    onAnswer({ shape: 'pickSeveral', optionIds: picked });
  };

  return (
    <>
      {choices.map((option) => (
        <ChoiceButton
          key={option.id}
          label={option.label}
          detail={option.detail}
          isSelected={picked.includes(option.id)}
          isDisabled={isBusy}
          onClick={() => toggle(option.id)}
        />
      ))}
      {hasNone && (
        <ChoiceButton
          label={HELM_COPY.answerNone}
          isSelected={picked.includes(NONE_ID)}
          isDisabled={isBusy}
          onClick={() => {
            setHint(null);
            setPicked((current) =>
              current.includes(NONE_ID) ? [] : [NONE_ID],
            );
          }}
        />
      )}
      <Button
        type='button'
        variant='primary'
        className='self-end'
        disabled={isBusy}
        onClick={done}
      >
        {picked.length > 0 && !picked.includes(NONE_ID)
          ? HELM_COPY.questionDoneCount(picked.length)
          : HELM_COPY.questionDone}
      </Button>
      {hint && (
        <p
          className='text-muted-foreground text-[13px] text-pretty'
          role='status'
        >
          {hint}
        </p>
      )}
    </>
  );
}

export default PickSeveralAnswer;
