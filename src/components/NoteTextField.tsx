import { useEffect, useRef } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import Field from '@/components/forms/Field';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;
const COUNTER_FROM = 1800;

interface NoteTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  /** Focused once the sheet around it has settled. */
  shouldFocus?: boolean;
  rows?: number;
}

function NoteTextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  shouldFocus = false,
  rows = 5,
}: NoteTextFieldProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const isPhone = useMediaQuery().isBelow('sm');

  // A drawer takes focus itself while it slides in, so the text box is focused once that settles.
  useEffect(() => {
    if (!shouldFocus) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        const field = textRef.current;
        field?.focus();
        field?.setSelectionRange(field.value.length, field.value.length);
      },
      isPhone ? PHONE_FOCUS_DELAY_MS : DESKTOP_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shouldFocus, isPhone]);

  return (
    <div className='space-y-1'>
      <Field label={label} isCompact>
        {() => (
          <Textarea
            ref={textRef}
            variant='outline'
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      {value.length >= COUNTER_FROM && (
        <p className='text-muted-foreground text-right text-xs tabular-nums'>
          {value.length.toLocaleString('en-US')} /{' '}
          {maxLength.toLocaleString('en-US')}
        </p>
      )}
    </div>
  );
}

export default NoteTextField;
