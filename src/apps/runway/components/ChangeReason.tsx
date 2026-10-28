import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import SuggestionChips from '@/components/SuggestionChips';
import {
  CHANGE_REASON_CHIPS,
  CHANGE_WORDS,
  MAX_NOTE_LENGTH,
} from '@apps/runway/constants';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import type { ChangeFlow } from '@apps/runway/forms/useChangeFlow';

interface ChangeReasonProps {
  flow: ChangeFlow;
  onClose: () => void;
}

/** Asked where the edit is saved, in place of the form: starter chips, one box, and a save that works with no answer. */
function ChangeReason({ flow, onClose }: ChangeReasonProps) {
  const { note, setNote, isSaving, error, summaryText } = flow;
  const trimmed = note.trim();

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={() => flow.setStep('form')} />
      <div className='space-y-1'>
        <ActionTitle>{CHANGE_WORDS.whyHeading}</ActionTitle>
        <p className='text-muted-foreground text-sm break-words'>
          {summaryText}
        </p>
      </div>
      <SuggestionChips
        label={CHANGE_WORDS.whyHeading}
        suggestions={CHANGE_REASON_CHIPS}
        isDisabled={isSaving}
        onPick={setNote}
      />
      <NoteTextField
        label='Note'
        value={note}
        onChange={setNote}
        placeholder={CHANGE_WORDS.whyPlaceholder}
        maxLength={MAX_NOTE_LENGTH}
        rows={2}
      />
      <ModalFooterActions
        note={error}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => void flow.save(trimmed === '' ? null : trimmed)}
          >
            {trimmed === ''
              ? CHANGE_WORDS.saveWithoutNote
              : CHANGE_WORDS.saveWithNote}
          </Button>
        }
      />
    </div>
  );
}

export default ChangeReason;
