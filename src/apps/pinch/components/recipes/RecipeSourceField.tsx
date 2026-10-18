import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import type { PillOption } from '@/components/PillGroup';
import SummaryEditor from '@/components/SummaryEditor';
import type { SourceChoice } from '@apps/pinch/components/recipes/recipeFormModel';
import { MAX_SOURCE_LABEL_LENGTH } from '@apps/pinch/constants';

interface RecipeSourceFieldProps {
  value: SourceChoice;
  /** The sources a recipe uses, plus the one this recipe has. */
  options: readonly PillOption<string>[];
  onChange: (value: SourceChoice) => void;
}

function RecipeSourceField({
  value,
  options,
  onChange,
}: RecipeSourceFieldProps) {
  const summary =
    value.choice === NEW_CHOICE
      ? value.newText.trim()
      : (options.find((option) => option.value === value.choice)?.label ?? '');

  return (
    <SummaryEditor
      label="Where it's from"
      title="Where it's from"
      summary={summary}
      placeholder="Add where it's from"
    >
      <PickOrCreate
        label='Sources'
        options={options}
        choice={value.choice}
        newText={value.newText}
        newPillLabel='New source'
        newPlaceholder='Serious Eats'
        maxLength={MAX_SOURCE_LABEL_LENGTH}
        isFocusedOnOpen={false}
        clearLabel='Remove source'
        onChange={(choice, newText) => onChange({ choice, newText })}
      />
      <p className='text-muted-foreground text-xs'>
        It shows on the recipe, and you can filter by it.
      </p>
    </SummaryEditor>
  );
}

export default RecipeSourceField;
