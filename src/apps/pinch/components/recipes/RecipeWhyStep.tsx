import { Button } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import SuggestionChips from '@/components/SuggestionChips';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import { MAX_RECIPE_NOTE_LENGTH } from '@apps/pinch/constants';
import { applyWhyChoice } from '@apps/pinch/utils/recipeChanges';

interface RecipeWhyStepProps {
  /** What the edit changed, as the tweak will record it. */
  changes: string[];
  choices: string[];
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  isSubmitting: boolean;
  error: string | null;
}

/** Shown in place of the recipe form when a save of a cooked recipe changes its ingredients or steps: the changes, then the one question that goes with them. Saving never waits on the answer, and the screen's own back returns to the form. */
function RecipeWhyStep({
  changes,
  choices,
  value,
  onChange,
  onSave,
  isSubmitting,
  error,
}: RecipeWhyStepProps) {
  return (
    <div className='flex flex-1 flex-col'>
      <div className='space-y-4 pb-4'>
        <div className='space-y-1'>
          <h2 className='text-lg font-medium'>Why did you change it?</h2>
          <p className='text-muted-foreground text-sm'>
            It goes in this recipe's notes with what you changed. You can leave
            it blank.
          </p>
        </div>
        <div className='bg-muted/50 border-border rounded-2xl border p-4'>
          <ChangeList changes={changes} />
        </div>
        <SuggestionChips
          label='Start with one'
          suggestions={choices}
          onPick={(choice) => onChange(applyWhyChoice(value, choice, choices))}
        />
        <NoteTextField
          label='Your reason'
          placeholder='Less vinegar, it was too sharp'
          maxLength={MAX_RECIPE_NOTE_LENGTH}
          value={value}
          onChange={onChange}
          rows={3}
        />
      </div>
      <ModalFooterActions
        note={error && <span className='text-destructive'>{error}</span>}
        rightActions={
          <Button type='button' loading={isSubmitting} onClick={onSave}>
            {value.trim() === '' ? 'Save without a reason' : 'Save'}
          </Button>
        }
      />
    </div>
  );
}

export default RecipeWhyStep;
