import { Input } from '@moondreamsdev/dreamer-ui/components';

import { shiftDateRangeStart } from '@/utils/dateRangeUtils';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

interface DateRangeFieldProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  disabled?: boolean;
}

function DateRangeField({ value, onChange, disabled = false }: DateRangeFieldProps) {
  return (
    <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
      <Input
        type='date'
        variant='outline'
        aria-label='Start date'
        value={value.startDate}
        disabled={disabled}
        onChange={(event) => onChange(shiftDateRangeStart(value, event.target.value))}
      />
      <span aria-hidden className='text-muted-foreground'>
        –
      </span>
      <Input
        type='date'
        variant='outline'
        aria-label='End date'
        value={value.endDate}
        min={value.startDate || undefined}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, endDate: event.target.value })}
      />
    </div>
  );
}

export default DateRangeField;
