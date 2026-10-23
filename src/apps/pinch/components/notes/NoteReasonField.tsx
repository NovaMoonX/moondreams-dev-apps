import NoteTextField from '@/components/NoteTextField';
import SuggestionChips from '@/components/SuggestionChips';
import {
  MAX_RECIPE_NOTE_LENGTH,
  NOTE_REASON_CHOICES,
} from '@apps/pinch/constants';
import { applyWhyChoice } from '@apps/pinch/utils/recipeChanges';

interface NoteReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

/** The why behind a change, with a few starting phrases. It is optional: a change saves without one. */
function NoteReasonField({ value, onChange, rows = 3 }: NoteReasonFieldProps) {
  return (
    <div className='space-y-2'>
      <NoteTextField
        label='Why'
        placeholder='Optional. It was a little bland'
        maxLength={MAX_RECIPE_NOTE_LENGTH}
        value={value}
        onChange={onChange}
        rows={rows}
      />
      <SuggestionChips
        label='Start with one'
        suggestions={NOTE_REASON_CHOICES}
        onPick={(choice) =>
          onChange(applyWhyChoice(value, choice, NOTE_REASON_CHOICES))
        }
      />
    </div>
  );
}

export default NoteReasonField;
