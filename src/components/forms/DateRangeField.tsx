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
    <div className='@container'>
      <div className='grid gap-2 @min-[26rem]:grid-cols-[1fr_auto_1fr] @min-[26rem]:items-center'>
        <Input
          type='date'
          variant='outline'
          className='min-w-0'
          aria-label='Start date'
          value={value.startDate}
          disabled={disabled}
          onChange={(event) => onChange(shiftDateRangeStart(value, event.target.value))}
        />
        <span aria-hidden className='text-muted-foreground text-center text-sm @min-[26rem]:hidden'>
          to
        </span>
        <span aria-hidden className='text-foreground hidden font-semibold @min-[26rem]:block'>
          –
        </span>
        <Input
          type='date'
          variant='outline'
          className='min-w-0'
          aria-label='End date'
          value={value.endDate}
          min={value.startDate || undefined}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, endDate: event.target.value })}
        />
      </div>
    </div>
  );
}

export default DateRangeField;
