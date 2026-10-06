import { useMemo, useRef, useState, type MouseEvent } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Globe } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  getTimezoneChoicesWith,
  getTimezoneCityMatches,
  getZoneFromChoiceValue,
} from '@/utils/timezoneSearch';

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
  const isPhone = useMediaQuery().isBelow('sm');
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const dayStart = day === undefined ? undefined : day * 86_400_000;
    return [...getTimezoneCityMatches(query, dayStart, isPhone), ...getTimezoneChoicesWith(value, dayStart, isPhone)];
  }, [day, value, query, isPhone]);

  const select = (
    <Select
      searchable
      searchPlaceholder='Search city or zone'
      options={options}
      value={value}
      disabled={disabled}
      onSearch={setQuery}
      onChange={(next) => {
        setQuery('');
        onChange(getZoneFromChoiceValue(next));
      }}
      className={join(pill && 'w-fit')}
      triggerClassName={join(
        pill && 'bg-secondary border-transparent gap-2 rounded-full! py-1.5 pr-3 pl-8 text-sm',
      )}
      dropdownClassName={join(pill && 'max-w-[calc(100vw-3rem)] min-w-72 sm:min-w-80')}
    />
  );

  const clearOnTrigger = (event: MouseEvent<HTMLDivElement>) => {
    const trigger = containerRef.current?.querySelector('button');
    if (trigger && trigger.contains(event.target as Node)) {
      setQuery('');
    }
  };

  if (!pill) {
    return (
      <div ref={containerRef} onClickCapture={clearOnTrigger}>
        {select}
      </div>
    );
  }

  return (
    <div ref={containerRef} onClickCapture={clearOnTrigger} className='relative w-fit'>
      <Globe className='pointer-events-none absolute top-1/2 left-3 z-10 h-3.5 w-3.5 -translate-y-1/2' />
      {select}
    </div>
  );
}

export default TimezoneSelect;
