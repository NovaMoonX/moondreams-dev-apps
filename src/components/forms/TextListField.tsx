import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import LabelChip from '@/components/LabelChip';

interface TextListFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  listLabel: string;
  placeholder?: string;
  maxItems: number;
  maxLength: number;
  shouldFocus?: boolean;
}

/** A short list of typed texts, added on Enter or "Add" and kept as chips with an ✕; Enter never submits the form around it. */
function TextListField({
  values,
  onChange,
  ariaLabel,
  listLabel,
  placeholder,
  maxItems,
  maxLength,
  shouldFocus = false,
}: TextListFieldProps) {
  const [text, setText] = useState('');
  const typed = text.trim().replace(/\s+/g, ' ');
  const isRepeat = values.some(
    (value) => value.toLowerCase() === typed.toLowerCase(),
  );
  const isFull = values.length >= maxItems;

  const add = () => {
    if (typed === '' || isRepeat || isFull) {
      return;
    }
    onChange([...values, typed]);
    setText('');
  };

  return (
    <div className='space-y-2'>
      {values.length > 0 && (
        <ul className='flex flex-wrap gap-x-2 gap-y-4' aria-label={listLabel}>
          {values.map((value) => (
            <li key={value} className='max-w-full'>
              <LabelChip
                ariaLabel={`Remove ${value}`}
                icon={<X className='h-3 w-3 shrink-0' aria-hidden='true' />}
                onClick={() =>
                  onChange(values.filter((candidate) => candidate !== value))
                }
              >
                {value}
              </LabelChip>
            </li>
          ))}
        </ul>
      )}
      {isFull ? (
        <p className='text-muted-foreground text-xs'>
          That's the most you can add ({maxItems}). Remove one to add another.
        </p>
      ) : (
        <div className='flex items-center gap-2'>
          <Input
            variant='outline'
            aria-label={ariaLabel}
            placeholder={placeholder}
            maxLength={maxLength}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus={shouldFocus}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button
            type='button'
            variant='secondary'
            disabled={typed === '' || isRepeat}
            onClick={add}
          >
            Add
          </Button>
        </div>
      )}
      {isRepeat && typed !== '' && (
        <p className='text-muted-foreground text-xs'>Already in the list.</p>
      )}
    </div>
  );
}

export default TextListField;
