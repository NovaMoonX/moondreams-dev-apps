import { useRef } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { WHY_VERBATIM_CAP } from '@apps/helm/utils/goalWhy';

interface GoalWhyFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  id?: string;
  autoFocus?: boolean;
}

/** The why's words: three rows that grow with the text, capped at what a goal keeps. */
function GoalWhyField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  id,
  autoFocus = false,
}: GoalWhyFieldProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(field, value, 8);

  return (
    <Textarea
      ref={field}
      id={id}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={WHY_VERBATIM_CAP}
      rows={3}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default GoalWhyField;
