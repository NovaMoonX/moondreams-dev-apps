import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import ChoiceButton from '@apps/helm/components/home/ChoiceButton';
import { HELM_COPY } from '@apps/helm/constants';

/** Two tall choices. */
function YesNoAnswer({ isBusy, onAnswer }: AnswerPartProps) {
  const answer = (optionId: 'yes' | 'no') =>
    onAnswer({ shape: 'yesNo', optionId, otherText: null });
  return (
    <>
      <ChoiceButton
        label={HELM_COPY.questionYes}
        isDisabled={isBusy}
        onClick={() => answer('yes')}
      />
      <ChoiceButton
        label={HELM_COPY.questionNo}
        isDisabled={isBusy}
        onClick={() => answer('no')}
      />
    </>
  );
}

export default YesNoAnswer;
