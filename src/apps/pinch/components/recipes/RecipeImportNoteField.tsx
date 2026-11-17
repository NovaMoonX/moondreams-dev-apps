import { useRef } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import SummaryEditor from '@/components/SummaryEditor';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { MAX_RECIPE_NOTE_LENGTH } from '@apps/pinch/constants';

interface RecipeImportNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** What the person wants to remember about a new recipe; it becomes the recipe's first journal note when the recipe is saved. */
function RecipeImportNoteField({
  value,
  onChange,
}: RecipeImportNoteFieldProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(field, value, 6);

  return (
    <SummaryEditor
      label='Your note'
      title='Your note'
      summary={value.trim()}
      placeholder='Anything to remember?'
      lines={2}
    >
      <div className='space-y-1'>
        <Textarea
          ref={field}
          rows={2}
          variant='outline'
          aria-label='Your note'
          placeholder="Adapted for chicken, made for Sam's birthday"
          maxLength={MAX_RECIPE_NOTE_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          Saved to this recipe's notes.
        </p>
      </div>
    </SummaryEditor>
  );
}

export default RecipeImportNoteField;
