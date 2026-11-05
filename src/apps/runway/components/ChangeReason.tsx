import { Button } from '@moondreamsdev/dreamer-ui/components';

import InlineNotice from '@/components/InlineNotice';
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
import { useAppSelector } from '@/store';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeReplaced } from '@apps/runway/utils/changeText';
import type { ChangeFlow } from '@apps/runway/forms/useChangeFlow';

interface ChangeReasonProps {
  flow: ChangeFlow;
  onClose: () => void;
  /** Starter chips for this change; the item kind's own when missing. */
  chips?: readonly string[];
  /** The save button's words once a reason is typed; "Save" when missing. */
  saveLabel?: string;
}

/** Asked where the edit is saved, in place of the form: starter chips, one box, and a save that works with no answer. */
function ChangeReason({
  flow,
  onClose,
  chips = CHANGE_REASON_CHIPS[flow.kind],
  saveLabel = CHANGE_WORDS.saveWithNote,
}: ChangeReasonProps) {
  const { note, setNote, isSaving, error, summaryText, replaced, warningText } =
    flow;
  const allCards = useAppSelector(selectAllCards);
  const mask = useMaskedText();
  const replacedText = describeReplaced(replaced, getCardNamer(allCards));
  const trimmed = note.trim();

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto [@media(max-height:419px)]:gap-2.5'>
      <BackLink onBack={() => flow.setStep('form')} />
      <div className='space-y-1'>
        <ActionTitle>{CHANGE_WORDS.whyHeading}</ActionTitle>
        <p className='text-muted-foreground text-sm break-words'>
          {mask(summaryText)}
        </p>
        {replacedText && (
          <p className='text-muted-foreground text-sm break-words'>
            {mask(replacedText)}
          </p>
        )}
      </div>
      {warningText && <InlineNotice tone='warning'>{warningText}</InlineNotice>}
      <SuggestionChips
        label={CHANGE_WORDS.reasonPicks}
        suggestions={chips}
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
            className='min-w-0 whitespace-nowrap max-sm:h-auto max-sm:min-h-10 max-sm:px-3 max-sm:py-1.5 max-sm:leading-tight max-sm:whitespace-normal'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => void flow.save(trimmed === '' ? null : trimmed)}
          >
            {trimmed === '' ? CHANGE_WORDS.saveWithoutNote : saveLabel}
          </Button>
        }
      />
    </div>
  );
}

export default ChangeReason;
