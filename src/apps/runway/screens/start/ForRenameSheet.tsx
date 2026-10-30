import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  BUDGET_WORDS,
  GROUP_WORDS,
  MAX_NAME_LENGTH,
} from '@apps/runway/constants';

interface ForRenameSheetProps {
  name: string;
  onClose: () => void;
  onDone: (name: string) => void;
}

/** One name field to change what a heading's bills or envelopes are for; a name another heading has joins them. */
function ForRenameSheet({ name, onClose, onDone }: ForRenameSheetProps) {
  const [text, setText] = useState(name);
  const trimmed = text.trim();

  return (
    <FormSheet isOpen onClose={onClose} title={GROUP_WORDS.rename(name)}>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed !== '') onDone(trimmed);
        }}
      >
        <Input
          variant='outline'
          aria-label={GROUP_WORDS.nameLabel}
          maxLength={MAX_NAME_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <ModalFooterActions
          rightActions={
            <Button type='submit' disabled={trimmed === ''}>
              {BUDGET_WORDS.renameDone}
            </Button>
          }
        />
      </form>
    </FormSheet>
  );
}

export default ForRenameSheet;
