import { Label } from '@moondreamsdev/dreamer-ui/components';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { toDateInputValue } from '@/utils/dateInputUtils';
import {
  MAX_EAT_BY_DATE,
  MIN_EAT_BY_DATE,
  PACKAGE_DATE_CHOICES,
} from '@apps/pinch/constants';
import {
  getAnswerDate,
  getPackageLabel,
  type DateAnswer,
  type DateChoice,
} from '@apps/pinch/utils/packages';
import DateInput from '@/components/DateInput';

const OPTIONS: PillOption<DateChoice>[] = [
  ...PACKAGE_DATE_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
  })),
  { value: 'PICK', label: 'Pick a date' },
  { value: 'NONE', label: 'No date' },
];

interface PackageDateFieldProps {
  value: DateAnswer;
  onChange: (answer: DateAnswer) => void;
  /** The caption over the answers; "Use by" for a package. */
  label?: string;
}

/** "When does it expire?" as quick answers with nothing chosen at first: a date is never guessed, so no date is an answer the person gives. A quick answer says the day it means; a date picked by hand opens its own field. */
function PackageDateField({
  value,
  onChange,
  label = 'Use by',
}: PackageDateFieldProps) {
  const { expiresAt } = getAnswerDate(value);
  const meaning =
    value.choice !== null && value.choice !== 'PICK' && value.choice !== 'NONE'
      ? getPackageLabel(expiresAt)
      : null;

  return (
    <div className='space-y-2'>
      <Label className='text-muted-foreground text-xs'>{label}</Label>
      <PillGroup
        label={label}
        options={OPTIONS}
        value={value.choice}
        onChange={(choice) =>
          onChange({
            choice,
            picked:
              choice === 'PICK' && value.picked === '' && expiresAt !== null
                ? toDateInputValue(expiresAt)
                : value.picked,
          })
        }
      />
      {meaning !== null && (
        <p className='text-muted-foreground text-xs' role='status'>
          {meaning}
        </p>
      )}
      {value.choice === 'PICK' && (
        <DateInput
          variant='outline'
          aria-label={`${label} date`}
          className={COMPACT_INPUT_CLASS}
          min={toDateInputValue(MIN_EAT_BY_DATE)}
          max={toDateInputValue(MAX_EAT_BY_DATE)}
          value={value.picked}
          onChange={(event) =>
            onChange({ choice: 'PICK', picked: event.target.value })
          }
        />
      )}
      {value.choice === 'NONE' && (
        <p className='text-muted-foreground text-xs'>
          It won&rsquo;t show as due, and it stays in your pantry until you use
          or toss it.
        </p>
      )}
    </div>
  );
}

export default PackageDateField;
