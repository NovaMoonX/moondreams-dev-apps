import { useRef } from 'react';

import { Textarea } from '@moondreamsdev/dreamer-ui/components';

import Field from '@/components/forms/Field';
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
    <div className='space-y-1'>
      <Field label='Anything to remember?'>
        {(id) => (
          <Textarea
            id={id}
            ref={field}
            rows={2}
            variant='outline'
            placeholder="Adapted for chicken, made for Sam's birthday"
            maxLength={MAX_RECIPE_NOTE_LENGTH}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      <p className='text-muted-foreground text-xs'>
        Saved as the first note on this recipe.
      </p>
    </div>
  );
}

export default RecipeImportNoteField;
