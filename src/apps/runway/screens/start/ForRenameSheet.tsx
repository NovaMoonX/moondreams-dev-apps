import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { ListX } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  BUDGET_WORDS,
  GROUP_WORDS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
} from '@apps/runway/constants';

interface ForRenameSheetProps {
  name: string;
  emoji: string | null;
  onClose: () => void;
  onDone: (name: string, emoji: string | null) => void;
  onTakeOut: () => void;
}

/** Changes a heading in the review: its name (a name another heading has joins them) and emoji (emptied, none), or taking its bills or envelopes out of it. */
function ForRenameSheet({
  name,
  emoji,
  onClose,
  onDone,
  onTakeOut,
}: ForRenameSheetProps) {
  const [text, setText] = useState(name);
  const [emojiText, setEmojiText] = useState(emoji ?? '');
  const trimmed = text.trim();

  return (
    <FormSheet isOpen onClose={onClose} title={name}>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed !== '') onDone(trimmed, emojiText.trim() || null);
        }}
      >
        <div className='flex items-center gap-2'>
          <EmojiField
            value={emojiText}
            onChange={setEmojiText}
            ariaLabel={GROUP_WORDS.emojiLabel}
            placeholder='🐾'
            maxLength={MAX_EMOJI_LENGTH}
          />
          <div className='min-w-0 flex-1'>
            <Input
              variant='outline'
              aria-label={GROUP_WORDS.nameLabel}
              maxLength={MAX_NAME_LENGTH}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </div>
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
