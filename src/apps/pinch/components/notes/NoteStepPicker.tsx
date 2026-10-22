import { PillGroup } from '@/components/PillGroup';
import { getStepAnchorText } from '@apps/pinch/utils/notes';

const WHOLE_RECIPE = 'recipe';

interface NoteStepPickerProps {
  steps: string[];
  /** The step (0-based), or null for the whole recipe. */
  value: number | null;
  onChange: (stepIndex: number | null) => void;
}

/** Which step an entry belongs to, so cooking shows it with that step: "Whole recipe" or a numbered pill per step (which search and fold past a dozen), with the chosen step's first words under them. */
function NoteStepPicker({ steps, value, onChange }: NoteStepPickerProps) {
  const options = [
    { value: WHOLE_RECIPE, label: 'Whole recipe' },
    ...steps.map((_, index) => ({
      value: String(index),
      label: `Step ${index + 1}`,
    })),
  ];
  const chosen = value === null ? undefined : steps[value];

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>Which step is it about?</p>
      <PillGroup
        label='Which step it is about'
        options={options}
        value={value === null ? WHOLE_RECIPE : String(value)}
        onChange={(next) =>
          onChange(next === WHOLE_RECIPE ? null : Number(next))
        }
      />
      {chosen !== undefined && (
        <p className='text-muted-foreground line-clamp-2 text-xs wrap-break-word'>
          {getStepAnchorText(chosen)}
        </p>
      )}
    </div>
  );
}

export default NoteStepPicker;
