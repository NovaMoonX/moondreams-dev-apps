import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { ListX } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
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
  onTakeOut: () => void;
}

/** Changes a heading in the review: its name (a name another heading has joins them), or taking its bills or envelopes out of it. */
function ForRenameSheet({
  name,
  onClose,
  onDone,
  onTakeOut,
}: ForRenameSheetProps) {
  const [text, setText] = useState(name);
  const trimmed = text.trim();

  return (
    <FormSheet isOpen onClose={onClose} title={name}>
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
        <ActionGroup>
          <ActionRow
            isGrouped
            isDestructive
            icon={<ListX />}
            label={BUDGET_WORDS.takeOut}
            subtitle={BUDGET_WORDS.takeOutNote}
            onClick={onTakeOut}
          />
        </ActionGroup>
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
