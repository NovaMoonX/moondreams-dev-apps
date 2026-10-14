import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import Field from '@/components/forms/Field';
import { MAX_IDEA_NOTE_LENGTH } from '@apps/pinch/constants';

interface IdeaNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Show the box at once instead of behind "+ Add a note". */
  isOpen?: boolean;
}

/** The optional note: a quiet "+ Add a note" link until it is wanted, then the box with a visible way to take it away. */
function IdeaNoteField({
  value,
  onChange,
  isOpen = false,
}: IdeaNoteFieldProps) {
  const [isRevealed, setIsRevealed] = useState(isOpen || value !== '');
  const [isTapped, setIsTapped] = useState(false);

  if (!isRevealed) {
    return (
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-10 justify-start gap-1 px-0!'
        onClick={() => {
          setIsTapped(true);
          setIsRevealed(true);
        }}
      >
        <Plus className='h-4 w-4' aria-hidden='true' />
        Add a note
      </Button>
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
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          onClick={() => {
            onChange('');
            setIsRevealed(false);
          }}
        >
          Remove note
        </Button>
      )}
    </div>
  );
}

export default IdeaNoteField;
