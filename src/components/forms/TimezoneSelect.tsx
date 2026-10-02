import { useMemo } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';

import { getTimezoneOptions } from '@/utils/timezoneUtils';

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

function TimezoneSelect({ value, onChange, disabled = false }: TimezoneSelectProps) {
  const options = useMemo(() => getTimezoneOptions(), []);

  return (
    <Select
      searchable
      searchPlaceholder='Search time zones…'
      options={options}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export default TimezoneSelect;
