import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { MapPin, X } from 'lucide-react';

import { DEBOUNCE_MS, useDebouncedValue } from '@/hooks/useDebounce';
import { getCityLabel } from '@/lib/cities/cityApi';
import { citySearchQueryOptions } from '@/lib/cities/cityQueries';
import type { City } from '@/lib/cities/types';

interface CitySearchFieldProps {
  value: City | null;
  onChange: (city: City | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MIN_QUERY_LENGTH = 2;

/** Search for a city and pick it; the pick shows as a chip with a visible remove button. */
function CitySearchField({ value, onChange, placeholder = 'Search for a city', disabled = false }: CitySearchFieldProps) {
  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text.trim(), DEBOUNCE_MS.autocomplete);
  const isReady = debounced.length >= MIN_QUERY_LENGTH;
  const { data: results = [], isFetching, isError } = useQuery({
    ...citySearchQueryOptions(debounced),
    enabled: isReady && !value,
  });
  const isSearching = text.trim().length >= MIN_QUERY_LENGTH && (debounced !== text.trim() || isFetching);

  if (value) {
    return (
      <div className='bg-secondary flex w-fit max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm'>
        <MapPin className='h-4 w-4 shrink-0' aria-hidden='true' />
        <span className='min-w-0 truncate'>{getCityLabel(value)}</span>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label='Remove city'
          className='h-8 w-8 shrink-0'
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <X className='h-4 w-4' />
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <Input
        type='search'
        variant='outline'
        placeholder={placeholder}
        aria-label={placeholder}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      {isSearching && <p className='text-muted-foreground text-sm'>Searching…</p>}
      {!isSearching && isReady && !isError && results.length === 0 && (
        <p className='text-muted-foreground text-sm'>No city found. Try another spelling.</p>
      )}
      {!isSearching && isError && (
        <p className='text-muted-foreground text-sm'>We couldn&apos;t search just now. You can add a city later.</p>
      )}
      {!isSearching && results.length > 0 && (
        <ul className='divide-border divide-y'>
          {results.map((city) => (
            <li key={`${city.latitude},${city.longitude}`}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-10 w-full justify-start gap-2 rounded-none px-0! py-2 text-left font-normal'
                onClick={() => {
                  setText('');
                  onChange(city);
                }}
              >
                <MapPin className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
                <span className='min-w-0'>{getCityLabel(city)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CitySearchField;
