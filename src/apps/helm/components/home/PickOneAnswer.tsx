import { useState } from 'react';

import { Pencil } from 'lucide-react';

import { ANSWER_TEXT_MAX, HELM_COPY } from '@apps/helm/constants';
import AnswerField from '@apps/helm/components/home/AnswerField';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

const ICON_CLASS = 'text-muted-foreground size-5 shrink-0';

/** The options as radio rows in one group, "new" and "none" quieter after them, and "Something else" last, opening a short field when the options may not cover it. A tap on an option fills its radio and sends. */
function PickOneAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const name = useAssistantName();
  const [isElseOpen, setIsElseOpen] = useState(false);
  const [elseText, setElseText] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const isQuietId = (id: string) => id === 'new' || id === 'none';
  const options = [
    ...question.options.filter((option) => !isQuietId(option.id)),
    ...question.options.filter((option) => isQuietId(option.id)),
  ];
  const pick = (optionId: string) => {
    setChosenId(optionId);
    onAnswer({ shape: 'pickOne', optionId, otherText: null });
  };

  return (
    <ChoiceGroup label={question.prompt} kind='radio'>
      {options.map((option) => (
        <ChoiceRow
          key={option.id}
          kind='radio'
          label={option.label}
          detail={option.detail}
          isQuiet={isQuietId(option.id)}
          isSelected={isBusy && chosenId === option.id}
          isDisabled={isBusy}
          onClick={() => pick(option.id)}
        />
      ))}
      {question.allowsSomethingElse && (
        <ChoiceRow
          kind='radio'
          label={HELM_COPY.questionSomethingElse}
          icon={<Pencil className={ICON_CLASS} aria-hidden='true' />}
          isSelected={isElseOpen}
          isDisabled={isBusy}
          onClick={() => setIsElseOpen((isOpen) => !isOpen)}
        />
      )}
      {isElseOpen && (
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
  );
}

export default PickOneAnswer;
