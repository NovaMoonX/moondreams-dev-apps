import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { MAX_THEATRES, THEATRE_NAME_MAX_CHARS } from '@apps/a-list/constants';
import type { TheatreDraft } from '@apps/a-list/types';
import { createTypedTheatre } from '@apps/a-list/utils/theatres';

interface TheaterNameFormProps {
  savedNames: string[];
  /** Resolves true once the theater is saved; the field is cleared only then, so a failed save keeps what was typed. */
  onAdd: (theatre: TheatreDraft) => boolean | Promise<boolean>;
  isDisabled?: boolean;
  /** Replaces the default line under the field; null shows none. */
  hint?: string | null;
}

function TheaterNameForm({
  savedNames,
  onAdd,
  isDisabled = false,
  hint,
}: TheaterNameFormProps) {
  const [name, setName] = useState('');
  const trimmedName = name.trim().replace(/\s+/g, ' ');
  const isFull = savedNames.length >= MAX_THEATRES;
  const isDuplicate = savedNames.some(
    (saved) => saved.toLowerCase() === trimmedName.toLowerCase(),
  );
  const canAdd =
    trimmedName.length > 0 && !isDuplicate && !isFull && !isDisabled;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) {
      return;
    }

    const didSave = await onAdd(createTypedTheatre(trimmedName));
    if (didSave) {
      setName('');
    }
  };

  const getHint = () => {
    if (isFull) {
      return `That's ${MAX_THEATRES} theaters, the most you can save. Remove one to add another.`;
    }
    if (isDuplicate) {
      return 'That one is already on your list.';
    }
    if (hint !== undefined) {
      return hint;
    }
    return "For now, type your theater's name. Soon you'll be able to search AMC's theaters and just tap yours.";
  };
  const hintText = getHint();

  if (isFull) {
    return <p className='text-foreground px-3 text-xs'>{getHint()}</p>;
  }

  return (
    <form className='space-y-2' onSubmit={handleSubmit}>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1'>
          <Input
            variant='outline'
            rounded='full'
            className='h-12 text-base'
            placeholder='AMC Southlake 24'
            aria-label='Theater name'
            maxLength={THEATRE_NAME_MAX_CHARS}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          type='submit'
          rounded='full'
          disabled={!canAdd}
          className='h-12 shrink-0'
        >
          Add
        </Button>
      </div>
      {hintText && (
        <p
          className={join(
            'px-3 text-xs',
            isDuplicate ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {hintText}
        </p>
      )}
    </form>
  );
}

export default TheaterNameForm;
