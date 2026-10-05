import { queryOptions } from '@tanstack/react-query';

export interface AirportOption {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  /** IANA zone the airport sits in, when the data has one. */
  timezone: string | null;
}

interface RawAirport {
  name: string;
  city: string;
  country: string;
  iata?: string;
  latitude: string;
  longitude: string;
  tz?: string;
}

export const airportsQueryKeys = {
  all: ['airports'] as const,
};

async function loadAirports(): Promise<AirportOption[]> {
  const { default: raw } = (await import('airport-codes/airports.json')) as {
    default: RawAirport[];
  };
  const seen = new Set<string>();
  const airports = raw
    .filter((airport) => airport.iata && /^[A-Z]{3}$/.test(airport.iata))
    .filter((airport) => {
      if (seen.has(airport.iata as string)) {
        return false;
      }
      seen.add(airport.iata as string);
      return true;
    })
    .map((airport) => ({
      iataCode: airport.iata as string,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      latitude: Number(airport.latitude),
      longitude: Number(airport.longitude),
      timezone: airport.tz && airport.tz !== '\\N' ? airport.tz : null,
    }))
    .sort((first, second) => first.iataCode.localeCompare(second.iataCode));
  return airports;
}

export function airportsQueryOptions() {
  return queryOptions({
    queryKey: airportsQueryKeys.all,
    queryFn: loadAirports,
    staleTime: Infinity,
  });
}
