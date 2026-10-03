import { queryOptions } from '@tanstack/react-query';

export interface AirlineOption {
  name: string;
  iataCode: string;
  icaoCode: string;
}

interface RawAirline {
  name: string;
  iata?: string;
  icao?: string;
  active: boolean;
}

export const airlinesQueryKeys = {
  all: ['airlines'] as const,
};

async function loadAirlines(): Promise<AirlineOption[]> {
  const { default: raw } = (await import('iata-airlines/active_airlines.json')) as {
    default: RawAirline[];
  };
  const seen = new Set<string>();
  const airlines = raw
    .filter((airline) => airline.active && airline.iata && airline.icao)
    .map((airline) => ({
      name: airline.name.trim(),
      iataCode: airline.iata as string,
      icaoCode: airline.icao as string,
    }))
    .filter((airline) => {
      const key = airline.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((first, second) => first.name.localeCompare(second.name));
  return airlines;
}

export function airlinesQueryOptions() {
  return queryOptions({
    queryKey: airlinesQueryKeys.all,
    queryFn: loadAirlines,
    staleTime: Infinity,
  });
}
