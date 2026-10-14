import { Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { MAX_EAT_BY_DATE, MIN_EAT_BY_DATE } from '@apps/pinch/constants';

interface EatByFieldProps {
  value: string;
  onChange: (value: string) => void;
  hint: string;
}

function EatByField({ value, onChange, hint }: EatByFieldProps) {
  return (
    <div className='min-w-0 space-y-1'>
      <Label className='text-muted-foreground text-xs'>Eat by</Label>
      <Input
        type='date'
        variant='outline'
        aria-label='Eat by'
        className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
        min={toDateInputValue(MIN_EAT_BY_DATE)}
        max={toDateInputValue(MAX_EAT_BY_DATE)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className='text-muted-foreground text-xs'>{hint}</p>
    </div>
  );
}

export default EatByField;
