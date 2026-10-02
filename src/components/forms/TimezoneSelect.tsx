import { useMemo } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getTimezoneOptions } from '@/utils/timezoneUtils';

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
  /** A compact pill showing just the current zone, instead of a full-width field. */
  pill?: boolean;
}

function TimezoneSelect({ value, onChange, disabled = false, pill = false }: TimezoneSelectProps) {
  const options = useMemo(() => getTimezoneOptions(), []);

  return (
    <Select
      searchable
      searchPlaceholder='Search time zones…'
      options={options}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={join(pill && 'w-fit')}
      triggerClassName={join(
        pill && 'bg-secondary border-transparent gap-2 rounded-full px-3 py-1.5 text-sm',
      )}
      dropdownClassName={join(pill && 'min-w-72')}
    />
  );
}

export default TimezoneSelect;
