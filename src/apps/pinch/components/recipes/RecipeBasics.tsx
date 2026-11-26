import { Input, Textarea } from '@moondreamsdev/dreamer-ui/components';

import DurationField from '@/components/forms/DurationField';
import SummaryEditor from '@/components/SummaryEditor';
import {
  isValidMinutes,
  parseMinutes,
} from '@apps/pinch/components/recipes/recipeFormModel';
import {
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

const toMinutes = (text: string) => {
  const minutes = parseMinutes(text);
  return minutes !== null && isValidMinutes(minutes) ? minutes : null;
};
const toText = (minutes: number | null) =>
  minutes === null ? '' : String(minutes);

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
      <div className='@container'>
        <div className='grid gap-3 @min-[20rem]:grid-cols-2'>
          <DurationField
            label='Prep time'
            minutes={toMinutes(prep)}
            onChange={(next) => onChange({ prep: toText(next) })}
          />
          <DurationField
            label='Cook time'
            minutes={toMinutes(cook)}
            onChange={(next) => onChange({ cook: toText(next) })}
          />
        </div>
      </div>
      {problem && <p className='text-destructive text-xs'>{problem}</p>}
    </SummaryEditor>
  );
}
