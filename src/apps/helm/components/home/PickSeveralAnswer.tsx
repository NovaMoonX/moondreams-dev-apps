import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Pencil } from 'lucide-react';

import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { ANSWER_TEXT_MAX, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

const NONE_ID = 'none';

/** Checkbox rows that tick on and off in one group; "None of these" clears the others and any tick clears it, "Something else" opens a field, and Send with the count sends what is ticked. */
function PickSeveralAnswer({
  question,
  isBusy,
  skip,
  onAnswer,
}: AnswerPartProps) {
  const name = useAssistantName();
  const [picked, setPicked] = useState<string[]>([]);
  const [isElseOpen, setIsElseOpen] = useState(false);
  const [elseText, setElseText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const choices = question.options.filter((option) => option.id !== NONE_ID);
  const hasNone = question.options.some((option) => option.id === NONE_ID);
  const otherText = isElseOpen ? elseText.trim() : '';
  const isNonePicked = picked.includes(NONE_ID);
  const count = isNonePicked ? 0 : picked.length + (otherText === '' ? 0 : 1);
  const toggle = (id: string) => {
    setHint(null);
    setPicked((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current.filter((entry) => entry !== NONE_ID), id],
    );
  };
  const send = () => {
    if (!isNonePicked && count === 0) {
      setHint(HELM_COPY.questionPickAtLeastOne);
      return;
    }
    onAnswer({
      shape: 'pickSeveral',
      optionIds: picked,
      otherText: isNonePicked || otherText === '' ? null : otherText,
    });
  };

  return (
    <>
      <ChoiceGroup label={question.prompt} kind='checkbox'>
        {choices.map((option) => (
          <ChoiceRow
            key={option.id}
            kind='checkbox'
            label={option.label}
            detail={option.detail}
            isSelected={picked.includes(option.id)}
            isDisabled={isBusy}
            onClick={() => toggle(option.id)}
          />
        ))}
        {hasNone && (
          <ChoiceRow
            kind='checkbox'
            label={HELM_COPY.answerNone}
            isQuiet
            isSelected={isNonePicked}
            isDisabled={isBusy}
            onClick={() => {
              setHint(null);
              setIsElseOpen(false);
              setPicked((current) =>
                current.includes(NONE_ID) ? [] : [NONE_ID],
              );
            }}
          />
        )}
        {question.allowsSomethingElse && (
          <ChoiceRow
            kind='checkbox'
            label={HELM_COPY.questionSomethingElse}
            icon={
              <Pencil
                className='text-muted-foreground size-5 shrink-0'
                aria-hidden='true'
              />
            }
            isSelected={isElseOpen}
            isDisabled={isBusy}
            onClick={() => {
              setHint(null);
              setPicked((current) =>
                current.filter((entry) => entry !== NONE_ID),
              );
              setIsElseOpen((isOpen) => !isOpen);
            }}
          />
        )}
        {isElseOpen && (
          <div className='p-3.5'>
            <Input
              variant='outline'
              aria-label={HELM_COPY.questionSomethingElseField(name)}
              placeholder={HELM_COPY.questionSomethingElseField(name)}
              className='helm-field'
              maxLength={ANSWER_TEXT_MAX}
              autoFocus
              value={elseText}
              onChange={(event) => {
                setHint(null);
                setElseText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || isBusy) return;
                event.preventDefault();
                send();
              }}
            />
          </div>
        )}
      </ChoiceGroup>
      <div className='flex items-center justify-between gap-3'>
        {skip}
        <Button
          type='button'
          variant='primary'
          className='ml-auto'
          disabled={isBusy}
          onClick={send}
        >
          {count > 0
            ? HELM_COPY.questionSendCount(count)
            : HELM_COPY.questionSend}
        </Button>
      </div>
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
