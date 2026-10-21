import { useState } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import Field from '@/components/forms/Field';
import RevealChip from '@/components/RevealChip';
import { MAX_IDEA_NOTE_LENGTH } from '@apps/pinch/constants';

interface IdeaNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  isOpen?: boolean;
}

function IdeaNoteField({
  value,
  onChange,
  isOpen = false,
}: IdeaNoteFieldProps) {
  const [isRevealed, setIsRevealed] = useState(isOpen || value !== '');
  const [isTapped, setIsTapped] = useState(false);

  if (!isRevealed) {
    return (
      <RevealChip
        icon={<Plus className='h-4 w-4' aria-hidden='true' />}
        onClick={() => {
          setIsTapped(true);
          setIsRevealed(true);
        }}
      >
        Add a note
      </RevealChip>
    );
  }

  return (
    <div className='space-y-1'>
      <Field label='Note'>
        {() => (
          <Textarea
            variant='outline'
            rows={3}
            autoFocus={isTapped}
            maxLength={MAX_IDEA_NOTE_LENGTH}
            placeholder='Anything you want to remember about it'
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      {!isOpen && (
        <RevealChip
          icon={<X className='h-4 w-4' aria-hidden='true' />}
          onClick={() => {
            onChange('');
            setIsRevealed(false);
          }}
        >
          Remove note
        </RevealChip>
      )}
    </div>
  );
}

export default IdeaNoteField;
