import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import TheaterFinder from '@apps/a-list/components/theaters/TheaterFinder';
import TheaterNameForm from '@apps/a-list/components/theaters/TheaterNameForm';
import type { TheatreDraft } from '@apps/a-list/types';

interface TheaterPickerProps {
  savedIds: string[];
  savedNames: string[];
  onAdd: (theatre: TheatreDraft) => void;
  isDisabled?: boolean;
}

function TheaterPicker({
  savedIds,
  savedNames,
  onAdd,
  isDisabled = false,
}: TheaterPickerProps) {
  const [isTyping, setIsTyping] = useState(false);

  return (
    <div className='space-y-3'>
      <TheaterFinder
        savedIds={savedIds}
        isDisabled={isDisabled}
        onAdd={onAdd}
      />
      {isTyping ? (
        <TheaterNameForm
          savedNames={savedNames}
          isDisabled={isDisabled}
          hint='Typed theaters carry just a name, which is all a showing needs.'
          onAdd={onAdd}
        />
      ) : (
        <div className='flex justify-center'>
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={() => setIsTyping(true)}
          >
            Can't find it? Add it by name
          </Button>
        </div>
      )}
    </div>
  );
}

export default TheaterPicker;
