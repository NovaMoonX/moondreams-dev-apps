import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';

import {
  DictateButton,
  DictationLine,
} from '@apps/helm/components/voice/Dictation';
import { HELM_COPY } from '@apps/helm/constants';
import {
  useHelmVoiceContext,
  useIsDictatingHere,
} from '@apps/helm/hooks/useHelmVoice';

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
  /** Answer later, drawn on the row with the mic and Send. */
  skip?: ReactNode;
}

/** A typed or spoken answer with its Send; Enter sends a one-line field, Shift+Enter a longer one. */
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
  skip = null,
}: AnswerFieldProps) {
  const canSend = value.trim() !== '' && !isDisabled;
  const field = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(field, value, 6);
  const owner = useId();
  const voice = useHelmVoiceContext();
  const isHere = useIsDictatingHere(owner);
  // Words arrive after the tap, by which time more may have been typed.
  const latest = useRef(value);
  const stopOnLeave = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    latest.current = value;
    stopOnLeave.current = isHere ? voice.cancel : () => {};
  });
  useEffect(() => () => stopOnLeave.current(), []);
  const appendWords = (words: string) => {
    const current = latest.current.trimEnd();
    onChange(
      (current.length > 0 ? `${current} ${words}` : words).slice(0, maxLength),
    );
  };
  return (
    <div className='flex w-full flex-col items-stretch gap-2'>
      {isMultiline ? (
        <Textarea
          ref={field}
          variant='outline'
          rows={3}
          aria-label={label}
          className='helm-field'
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            const isSend = event.shiftKey || event.metaKey || event.ctrlKey;
            if (event.key !== 'Enter' || !isSend || !canSend) return;
            event.preventDefault();
            onSend();
          }}
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
      <DictationLine owner={owner} />
      <div className='flex items-center gap-1'>
        {skip}
        <DictateButton
          owner={owner}
          label={HELM_COPY.dictateAnswer}
          className='mr-1 ml-auto'
          onWords={appendWords}
          isDisabled={isDisabled}
        />
        <Button
          type='button'
          variant='primary'
          disabled={!canSend}
          onClick={onSend}
        >
          {HELM_COPY.questionSend}
        </Button>
      </div>
    </div>
  );
}

export default AnswerField;
