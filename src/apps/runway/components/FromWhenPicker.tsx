import { Input } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup } from '@/components/PillGroup';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { addUtcDays } from '@apps/runway/engine/dates';
import type { FromWhenValue } from '@apps/runway/utils/fromWhen';

interface FromWhenPickerProps {
  value: FromWhenValue;
  onChange: (value: FromWhenValue) => void;
  today: number;
  isDisabled?: boolean;
}

const options = [
  { value: 'now', label: CHANGE_WORDS.fromNow },
  { value: 'date', label: CHANGE_WORDS.fromDate },
] as const;

/** When a change starts. Earlier days keep what they had; the choices for a stretch, one income day and ending arrive with later changes. */
function FromWhenPicker({
  value,
  onChange,
  today,
  isDisabled = false,
}: FromWhenPickerProps) {
  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs'>
        {CHANGE_WORDS.fromHeading}
      </p>
      <PillGroup
        label={CHANGE_WORDS.fromHeading}
        options={options}
        value={value.choice}
        onChange={(choice) => !isDisabled && onChange({ ...value, choice })}
      />
      {value.choice === 'date' && (
        <Input
          type='date'
          variant='outline'
          aria-label={CHANGE_WORDS.dateLabel}
          min={toDateInputValue(addUtcDays(today, 1))}
          value={value.date}
          disabled={isDisabled}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
      )}
    </div>
  );
}

export default FromWhenPicker;
