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

const STATUS_KEY = '__status';

const getCityKey = (city: City) => `${city.latitude},${city.longitude}`;

function CitySelect({ value, onChange, disabled = false }: CitySelectProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS.autocomplete);
  const { data: results = [], isFetching, isError } = useQuery({
    ...citySearchQueryOptions(debounced),
    enabled: debounced.length >= MIN_QUERY_LENGTH,
  });
  const cities = useMemo(
    () => (value ? [value, ...results.filter((city) => getCityKey(city) !== getCityKey(value) && getCityLabel(city) !== getCityLabel(value))] : results),
    [value, results],
  );
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= MIN_QUERY_LENGTH && (isFetching || trimmedQuery !== debounced);
  // The Select hides any option whose text and description lack the typed text, and the geocoder
  // matches loosely (Montreal finds Montréal), so such results carry the typed text as a description.
  const status = isSearching
    ? 'Searching…'
    : isError
      ? 'Couldn’t search just now. You can add a city later.'
      : trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0
        ? 'No city found'
        : trimmedQuery.length < MIN_QUERY_LENGTH && !value
          ? 'Type two letters to search'
          : null;
  const options = useMemo(
    () => [
      ...cities.map((city) => {
        const label = getCityLabel(city);
        return {
          value: getCityKey(city),
          text: label,
          ...(label.toLowerCase().includes(query.toLowerCase()) || (value && getCityKey(city) === getCityKey(value))
            ? {}
            : { description: `Matches “${query}”` }),
        };
      }),
      ...(status ? [{ value: STATUS_KEY, text: status, description: `for “${query}”`, disabled: true }] : []),
    ],
    [cities, query, status, value],
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
        triggerClassName='pl-9 [&>span]:mr-6'
        onSearch={setQuery}
        onChange={(key) => {
          if (key === STATUS_KEY) {
            return;
          }
          setQuery('');
          onChange(cities.find((city) => getCityKey(city) === key) ?? null);
        }}
      />
    </div>
  );
}

export default CitySelect;
