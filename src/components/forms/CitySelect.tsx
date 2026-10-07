import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Select } from '@moondreamsdev/dreamer-ui/components';
import { MapPin } from 'lucide-react';

import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import { getCityLabel } from '@/lib/cities/cityApi';
import { citySearchQueryOptions } from '@/lib/cities/cityQueries';
import type { City } from '@/lib/cities/types';

interface CitySelectProps {
  value: City | null;
  onChange: (city: City | null) => void;
  disabled?: boolean;
}

const MIN_QUERY_LENGTH = 2;

const getCityKey = (city: City) => `${city.latitude},${city.longitude}`;

function CitySelect({ value, onChange, disabled = false }: CitySelectProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS.autocomplete);
  const { data: results = [] } = useQuery({
    ...citySearchQueryOptions(debounced),
    enabled: debounced.length >= MIN_QUERY_LENGTH,
  });
  const cities = useMemo(
    () => (value ? [value, ...results.filter((city) => getCityKey(city) !== getCityKey(value))] : results),
    [value, results],
  );
  const options = useMemo(
    () => cities.map((city) => ({ value: getCityKey(city), text: getCityLabel(city) })),
    [cities],
  );

  return (
    <div className='relative'>
      <MapPin className='pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2' aria-hidden='true' />
      <Select
        searchable
        clearable
        options={options}
        value={value ? getCityKey(value) : ''}
        disabled={disabled}
        placeholder='Search for a city'
        searchPlaceholder='Type a city, like Seattle'
        triggerClassName='pl-9'
        onSearch={setQuery}
        onChange={(key) => {
          setQuery('');
          onChange(cities.find((city) => getCityKey(city) === key) ?? null);
        }}
      />
    </div>
  );
}

export default CitySelect;
