import { useState } from 'react';

import AnswerField from '@apps/helm/components/home/AnswerField';
import type { AnswerPartProps } from '@apps/helm/components/home/AnswerPartProps';
import { ANSWER_TEXT_MAX, HELM_COPY } from '@apps/helm/constants';

/** A few words, up to the cap: from the composer at the bottom in the thread, from its own field in a sheet that covers it. */
function FreeTextAnswer({
  isBusy,
  isComposerAnswer,
  isComposerTarget,
  skip,
  onAnswer,
}: AnswerPartProps) {
  const [text, setText] = useState('');
  if (isComposerAnswer) {
    return (
      <>
        {isComposerTarget && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.questionFreeTextHint}
          </p>
        )}
      </>
    );
  }
  return (
    <AnswerField
      label={HELM_COPY.questionFreeTextPlaceholder}
      placeholder={HELM_COPY.questionFreeTextPlaceholder}
      value={text}
      onChange={setText}
      maxLength={ANSWER_TEXT_MAX}
      isMultiline
      isDisabled={isBusy}
      skip={skip}
      onSend={() => onAnswer({ shape: 'freeText', text: text.trim() })}
    />
  );
}

export default FreeTextAnswer;
