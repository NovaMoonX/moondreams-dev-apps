import { useMemo } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Globe } from 'lucide-react';

import { getTimezoneChoicesWith } from '@/utils/timezoneSearch';

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
  /** The moment the offsets and abbreviations shown are for; they change with daylight saving. Defaults to now. */
  at?: number;
  /** A compact pill showing just the current zone, instead of a full-width field. */
  pill?: boolean;
}

function TimezoneSelect({ value, onChange, disabled = false, pill = false, at }: TimezoneSelectProps) {
  const day = at === undefined ? undefined : Math.floor(at / 86_400_000);
  const options = useMemo(() => getTimezoneChoicesWith(value, day === undefined ? undefined : day * 86_400_000), [day, value]);

  const select = (
    <Select
      searchable
      searchPlaceholder='Search a city or zone, like Phoenix or Eastern Time'
      options={options}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={join(pill && 'w-fit')}
      triggerClassName={join(
        pill && 'bg-secondary border-transparent gap-2 rounded-full! py-1.5 pr-3 pl-8 text-sm',
      )}
      dropdownClassName={join(pill && 'max-w-[calc(100vw-3rem)] min-w-80')}
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
