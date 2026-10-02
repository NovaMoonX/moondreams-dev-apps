import { Input, Label, Select } from '@moondreamsdev/dreamer-ui/components';

import { getDayOptions } from '@/utils/dateRangeUtils';
import type { TripSpace } from '@apps/waypoint/types';

interface DayTimeFieldProps {
  trip: TripSpace;
  label: string;
  day: number;
  time: string;
  onChange: (day: number, time: string) => void;
}

export function DayTimeField({ trip, label, day, time, onChange }: DayTimeFieldProps) {
  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Select
          options={getDayOptions(trip.startDate, trip.endDate, day).map(({ value, label }) => ({ value, text: label }))}
          value={String(day)}
          onChange={(value) => onChange(Number(value), time)}
        />
        <Input
          type='time'
          aria-label={`${label} time`}
          value={time}
          onChange={(event) => onChange(day, event.target.value)}
        />
      </div>
    </div>
  );
}

export default DayTimeField;
