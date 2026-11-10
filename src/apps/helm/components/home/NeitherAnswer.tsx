import { useId } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { QUIET_CLASS } from '@apps/helm/components/home/ChoiceButton';
import { FACT_STATEMENT_MAX, HELM_COPY } from '@apps/helm/constants';

interface NeitherAnswerProps {
  isBusy: boolean;
  text: string;
  onTextChange: (text: string) => void;
  onSave: (text: string) => void;
  onBack: () => void;
}

/** "Neither" to which fact is true: one field for what is true now, which becomes the fact that replaces both. */
function NeitherAnswer({
  isBusy,
  text,
  onTextChange,
  onSave,
  onBack,
}: NeitherAnswerProps) {
  const fieldId = useId();
  const trimmed = text.trim();
  const requestBack = useDiscardGuard({
    isDirty: trimmed !== '',
    onClose: onBack,
    isBusy,
  });

  return (
    <div className='flex flex-col gap-2'>
      <label htmlFor={fieldId} className='text-sm font-medium'>
        {HELM_COPY.whichIsTrueNoneTitle}
      </label>
      <Input
        id={fieldId}
        value={text}
        maxLength={FACT_STATEMENT_MAX}
        onChange={(event) => onTextChange(event.target.value)}
      />
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.whichIsTrueNoneHelp}
      </p>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-3'>
        <Button
          type='button'
          loading={isBusy}
          disabled={trimmed === ''}
          onClick={() => onSave(trimmed)}
        >
          {HELM_COPY.editSave}
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={QUIET_CLASS}
          disabled={isBusy}
          onClick={requestBack}
        >
          {HELM_COPY.whichIsTrueNoneBack}
        </Button>
      </div>
    </div>
  );
}

export default NeitherAnswer;
