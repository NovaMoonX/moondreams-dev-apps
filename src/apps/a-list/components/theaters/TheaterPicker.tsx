import { useState } from 'react';

import CantFindItButton from '@/components/CantFindItButton';
import TheaterFinder from '@apps/a-list/components/theaters/TheaterFinder';
import TheaterNameForm from '@apps/a-list/components/theaters/TheaterNameForm';
import type { TheatreDraft } from '@apps/a-list/types';

interface TheaterPickerProps {
  savedIds: string[];
  savedNames: string[];
  onAdd: (theatre: TheatreDraft) => boolean | Promise<boolean>;
  isDisabled?: boolean;
  /** Inside a modal: the results scroll instead of growing the sheet. */
  isCompact?: boolean;
}

function TheaterPicker({
  savedIds,
  savedNames,
  onAdd,
  isDisabled = false,
  isCompact = false,
}: TheaterPickerProps) {
  const [isTyping, setIsTyping] = useState(false);

  return (
    <div className='space-y-3'>
      <TheaterFinder
        isCompact={isCompact}
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
        <CantFindItButton onClick={() => setIsTyping(true)}>
          Can't find it? Add it by name
        </CantFindItButton>
      )}
    </div>
  );
}

export default TheaterPicker;
