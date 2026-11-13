import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import ChoiceButton from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';

/** Two tall choices. */
function YesNoAnswer({ question, isBusy, onAnswer }: AnswerPartProps) {
  const answer = (optionId: 'yes' | 'no') =>
    onAnswer({ shape: 'yesNo', optionId, otherText: null });
  const labelOf = (id: 'yes' | 'no', fallback: string) =>
    question.options.find((option) => option.id === id)?.label ?? fallback;
  return (
    <>
      <ChoiceButton
        label={labelOf('yes', HELM_COPY.questionYes)}
        isDisabled={isBusy}
        onClick={() => answer('yes')}
      />
      <ChoiceButton
        label={labelOf('no', HELM_COPY.questionNo)}
        isDisabled={isBusy}
        onClick={() => answer('no')}
      />
    </>
  );
}

export default YesNoAnswer;
