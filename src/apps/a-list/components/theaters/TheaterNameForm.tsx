import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { MAX_THEATRES, THEATRE_NAME_MAX_CHARS } from '@apps/a-list/constants';
import type { TheatreDraft } from '@apps/a-list/types';
import { createTypedTheatre } from '@apps/a-list/utils/theatres';

interface TheaterNameFormProps {
  savedNames: string[];
  onAdd: (theatre: TheatreDraft) => void;
  isDisabled?: boolean;
}

function TheaterNameForm({
  savedNames,
  onAdd,
  isDisabled = false,
}: TheaterNameFormProps) {
  const [name, setName] = useState('');
  const trimmedName = name.trim();
  const isFull = savedNames.length >= MAX_THEATRES;
  const isSaved = savedNames.some(
    (saved) => saved.toLowerCase() === trimmedName.toLowerCase(),
  );
  const canAdd = trimmedName.length > 0 && !isSaved && !isFull && !isDisabled;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) {
      return;
    }

    onAdd(createTypedTheatre(trimmedName));
    setName('');
  };

  const getHint = () => {
    if (isFull) {
      return `That's ${MAX_THEATRES} theaters, the most you can save. Remove one to add another.`;
    }
    if (isSaved) {
      return 'That one is already on your list.';
    }
    return "For now, type your theater's name. Soon you'll be able to search AMC's theaters and just tap yours.";
  };

  return (
    <form className='space-y-2' onSubmit={handleSubmit}>
      <div className='flex items-center gap-2'>
        <div className='min-w-0 flex-1'>
          <Input
            variant='solid'
            rounded='full'
            className='h-12 text-base'
            placeholder='AMC Southlake 24'
            aria-label='Theater name'
            maxLength={THEATRE_NAME_MAX_CHARS}
            disabled={isFull}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          type='submit'
          rounded='full'
          disabled={!canAdd}
          className='shrink-0'
        >
          Add
        </Button>
      </div>
      <p className='text-muted-foreground px-1 text-xs'>{getHint()}</p>
    </form>
  );
}

export default TheaterNameForm;
