import { Label } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { MAX_EAT_BY_DATE, MIN_EAT_BY_DATE } from '@apps/pinch/constants';
import DateInput from '@/components/DateInput';

interface EatByFieldProps {
  value: string;
  onChange: (value: string) => void;
  hint: string;
  /** A settings row: the caption on the left, the date on the right and the hint under both. */
  isRow?: boolean;
}

function EatByField({ value, onChange, hint, isRow = false }: EatByFieldProps) {
  const input = (
    <DateInput
      variant='outline'
      aria-label='Eat by'
      className={join(COMPACT_INPUT_CLASS, 'min-w-0', isRow && 'w-44')}
      min={toDateInputValue(MIN_EAT_BY_DATE)}
      max={toDateInputValue(MAX_EAT_BY_DATE)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  if (isRow) {
    return (
      <div className='space-y-1 px-4 py-3'>
        <div className='flex items-center justify-between gap-3'>
          <Label className='min-w-0 text-sm'>Eat by</Label>
          <div className='shrink-0'>{input}</div>
        </div>
        <p className='text-muted-foreground text-xs'>{hint}</p>
      </div>
    );
  }

  return (
    <div className='min-w-0 space-y-1'>
      <Label className='text-muted-foreground text-xs'>Eat by</Label>
      {input}
      <p className='text-muted-foreground text-xs'>{hint}</p>
    </div>
  );
}

export default EatByField;
