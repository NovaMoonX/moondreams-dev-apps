import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';

interface AnswerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isDisabled: boolean;
  maxLength: number;
  isMultiline?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/** A typed answer with its Send; Enter sends a one-line field. */
function AnswerField({
  label,
  value,
  onChange,
  onSend,
  isDisabled,
  maxLength,
  isMultiline = false,
  placeholder,
  autoFocus = false,
}: AnswerFieldProps) {
  const canSend = value.trim() !== '' && !isDisabled;
  return (
    <div className='flex w-full flex-col items-stretch gap-2'>
      {isMultiline ? (
        <Textarea
          variant='outline'
          rows={3}
          aria-label={label}
          className='helm-field'
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          variant='outline'
          aria-label={label}
          className='helm-field'
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !canSend) return;
            event.preventDefault();
            onSend();
          }}
        />
      )}
      <Button
        type='button'
        variant='primary'
        className='self-end'
        disabled={!canSend}
        onClick={onSend}
      >
        {HELM_COPY.questionSend}
      </Button>
    </div>
  );
}

export default AnswerField;
