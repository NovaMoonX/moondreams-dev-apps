import { useState } from 'react';

import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import {
  ChoiceGroup,
  ChoiceRow,
} from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';

function YesNoAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const [chosen, setChosen] = useState<'yes' | 'no' | null>(null);
  const answer = (optionId: 'yes' | 'no') => {
    setChosen(optionId);
    onAnswer({ shape: 'yesNo', optionId, otherText: null });
  };
  const labelOf = (id: 'yes' | 'no', fallback: string) =>
    question.options.find((option) => option.id === id)?.label ?? fallback;
  return (
    <ChoiceGroup label={question.prompt} kind='radio'>
      {(['yes', 'no'] as const).map((id) => (
        <ChoiceRow
          key={id}
          kind='radio'
          label={labelOf(
            id,
            id === 'yes' ? HELM_COPY.questionYes : HELM_COPY.questionNo,
          )}
          isSelected={isBusy && chosen === id}
          isDisabled={isBusy}
          onClick={() => answer(id)}
        />
      ))}
    </ChoiceGroup>
  );
}

export default YesNoAnswer;
