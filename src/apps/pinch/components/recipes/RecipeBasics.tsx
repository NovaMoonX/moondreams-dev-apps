import { Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import Field from '@/components/forms/Field';
import SummaryEditor from '@/components/SummaryEditor';
import {
  isValidMinutes,
  parseMinutes,
} from '@apps/pinch/components/recipes/recipeFormModel';
import {
  MAX_MINUTES,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_TITLE_LENGTH,
} from '@apps/pinch/constants';
import { formatMinutes } from '@apps/pinch/utils/recipeFormat';

interface TitleFieldProps {
  value: string;
  onChange: (value: string) => void;
  defaultOpen: boolean;
}

export function RecipeTitleField({
  value,
  onChange,
  defaultOpen,
}: TitleFieldProps) {
  const problem =
    value.length > MAX_RECIPE_TITLE_LENGTH
      ? `Keep it to ${MAX_RECIPE_TITLE_LENGTH} characters or fewer`
      : null;

  return (
    <SummaryEditor
      label='Title'
      title='Title'
      summary={value.trim()}
      placeholder='Add a title'
      problem={problem}
      defaultOpen={defaultOpen}
    >
      <Input
        variant='outline'
        aria-label='Title'
        placeholder='Adobo chicken'
        maxLength={MAX_RECIPE_TITLE_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </SummaryEditor>
  );
}

interface DescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function RecipeDescriptionField({
  value,
  onChange,
}: DescriptionFieldProps) {
  const problem =
    value.length > MAX_RECIPE_DESCRIPTION_LENGTH
      ? `Keep it to ${MAX_RECIPE_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`
      : null;

  return (
    <SummaryEditor
      label='Description'
      title='Description'
      summary={value.trim()}
      placeholder='Add a line about this dish'
      problem={problem}
      lines={2}
    >
      <Textarea
        rows={5}
        variant='outline'
        aria-label='Description'
        placeholder='A line about this dish'
        maxLength={MAX_RECIPE_DESCRIPTION_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </SummaryEditor>
  );
}

const getTimeText = (label: string, text: string) => {
  if (text.trim() === '') {
    return null;
  }
  const minutes = parseMinutes(text);
  const isUsable = minutes !== null && isValidMinutes(minutes);
  const result = `${label} ${isUsable ? formatMinutes(minutes) : `${text} min`}`;
  return result;
};

const getTimeProblem = (prep: string, cook: string) => {
  const invalid = [
    !isValidMinutes(parseMinutes(prep)) && 'prep',
    !isValidMinutes(parseMinutes(cook)) && 'cook',
  ].filter(Boolean);
  return invalid.length === 0
    ? null
    : `Use whole minutes for ${invalid.join(' and ')}`;
};

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TimeInput({ label, value, onChange }: TimeInputProps) {
  return (
    <Field label={label}>
      {() => (
        <div className='relative'>
          <Input
            type='number'
            inputMode='numeric'
            min={0}
            step={1}
            max={MAX_MINUTES}
            variant='outline'
            aria-label={`${label} in minutes`}
            className='[appearance:textfield] pr-12! [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span
            className='text-muted-foreground pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm'
            aria-hidden='true'
          >
            min
          </span>
        </div>
      )}
    </Field>
  );
}

interface TimesFieldProps {
  prep: string;
  cook: string;
  onChange: (patch: { prep?: string; cook?: string }) => void;
}

export function RecipeTimesField({ prep, cook, onChange }: TimesFieldProps) {
  const summary = [getTimeText('Prep', prep), getTimeText('Cook', cook)]
    .filter(Boolean)
    .join(' · ');
  const problem = getTimeProblem(prep, cook);

  return (
    <SummaryEditor
      label='Prep and cook'
      title='Prep and cook'
      summary={summary}
      placeholder='Add prep and cook time'
      problem={problem}
    >
      <div className='grid grid-cols-2 gap-3'>
        <TimeInput
          label='Prep time'
          value={prep}
          onChange={(value) => onChange({ prep: value })}
        />
        <TimeInput
          label='Cook time'
          value={cook}
          onChange={(value) => onChange({ cook: value })}
        />
      </div>
      {problem && <p className='text-destructive text-xs'>{problem}</p>}
    </SummaryEditor>
  );
}
