import { Input, Label } from '@moondreamsdev/dreamer-ui/components';

import { shiftDateRangeStart } from '@/utils/dateRangeUtils';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

interface DateRangeFieldProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
}

function DateRangeField({
  value,
  onChange,
  startLabel = 'From',
  endLabel = 'To',
  disabled = false,
}: DateRangeFieldProps) {
  return (
    <div className='grid grid-cols-2 gap-3'>
      <div className='space-y-1'>
        <Label>{startLabel}</Label>
        <Input
          type='date'
          variant='outline'
          value={value.startDate}
          disabled={disabled}
          onChange={(event) => onChange(shiftDateRangeStart(value, event.target.value))}
        />
      </div>
      <div className='space-y-1'>
        <Label>{endLabel}</Label>
        <Input
          type='date'
          variant='outline'
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
