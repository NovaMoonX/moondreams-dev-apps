import { useMemo } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Globe } from 'lucide-react';

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

  const select = (
    <Select
      searchable
      searchPlaceholder='Search time zones…'
      options={options}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={join(pill && 'w-fit')}
      triggerClassName={join(
        pill && 'bg-secondary border-transparent gap-2 rounded-md py-1.5 pr-3 pl-9 text-sm',
      )}
      dropdownClassName={join(pill && 'min-w-72')}
    />
  );

  if (!pill) {
    return select;
  }

  return (
    <div className='relative w-fit'>
      <Globe className='pointer-events-none absolute top-1/2 left-3 z-10 h-3.5 w-3.5 -translate-y-1/2' />
      {select}
    </div>
  );
}

export default TimezoneSelect;
