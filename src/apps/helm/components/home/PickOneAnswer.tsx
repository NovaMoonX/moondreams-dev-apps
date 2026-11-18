import { useState } from 'react';

import { Pencil } from 'lucide-react';

import { ANSWER_TEXT_MAX, HELM_COPY } from '@apps/helm/constants';
import AnswerField from '@apps/helm/components/home/AnswerField';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { acceptsFreeAnswer } from '@apps/helm/utils/questionAnswers';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

function PickOneAnswer({
  question,
  isBusy,
  isComposerAnswer,
  onAnswer,
}: AnswerPartProps) {
  const name = useAssistantName();
  const [isElseOpen, setIsElseOpen] = useState(false);
  const [elseText, setElseText] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const isQuietId = (id: string) => id === 'new' || id === 'none';
  // "Neither" to which fact is true is the words typed below, so its pill goes.
  const isNeitherWords = isComposerAnswer && acceptsFreeAnswer(question);
  const shown = question.options.filter(
    (option) => !(isNeitherWords && option.id === 'none'),
  );
  const options = [
    ...shown.filter((option) => !isQuietId(option.id)),
    ...shown.filter((option) => isQuietId(option.id)),
  ];
  const hint = !isComposerAnswer
    ? null
    : question.kind === 'whichIsTrue' && isNeitherWords
      ? HELM_COPY.questionNeitherHint
      : question.allowsSomethingElse
        ? HELM_COPY.questionElseHint
        : null;
  // A thorough look used up for the month arrives as its own option with the reason in `detail`, printed in its row.
  const isLocked = (id: string) =>
    question.kind === 'researchDepth' && id === 'thoroughLocked';
  const pick = (optionId: string) => {
    setChosenId(optionId);
    setIsElseOpen(false);
    onAnswer({ shape: 'pickOne', optionId, otherText: null });
  };

  return (
    <>
      <ChoiceGroup label={question.prompt} kind='radio'>
        {options.map((option) => (
          <ChoiceRow
            key={option.id}
            kind='radio'
            label={option.label}
            detail={option.detail}
            isQuiet={isQuietId(option.id)}
            isSelected={isBusy && chosenId === option.id}
            isDisabled={isBusy || isLocked(option.id)}
            onClick={() => pick(option.id)}
          />
        ))}
        {question.allowsSomethingElse && !isComposerAnswer && (
          <ChoiceRow
            kind='radio'
            label={HELM_COPY.questionSomethingElse}
            opensWith={Pencil}
            isSelected={isElseOpen}
            isDisabled={isBusy}
            onClick={() => setIsElseOpen((isOpen) => !isOpen)}
          />
        )}
        {isElseOpen && !isComposerAnswer && (
          <div className='p-3.5'>
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
          </div>
        )}
      </ChoiceGroup>
      {hint && (
        <p className='text-muted-foreground text-[13px] text-pretty'>{hint}</p>
      )}
    </>
  );
}

export default PickOneAnswer;
