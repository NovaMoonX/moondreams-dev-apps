import type { DayForecast, HourForecast, WeatherForecast, WeatherRequest } from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  timezone?: string;
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
  hourly?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

/** Open-Meteo's free tier is keyless but CC BY 4.0, so anywhere this data shows must credit it. */
export async function fetchForecast({
  latitude,
  longitude,
  timezone,
  startDate,
  endDate,
}: WeatherRequest): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: timezone ?? 'auto',
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status})`);
  }

  const data: OpenMeteoResponse = await response.json();
  const days = (data.daily?.time ?? []).map(
    (date, index): DayForecast => ({
      date,
      weatherCode: data.daily?.weather_code?.[index] ?? null,
      tempMax: data.daily?.temperature_2m_max?.[index] ?? null,
      tempMin: data.daily?.temperature_2m_min?.[index] ?? null,
      precipChance: data.daily?.precipitation_probability_max?.[index] ?? null,
    }),
  );
  const hours = (data.hourly?.time ?? []).map(
    (time, index): HourForecast => ({
      time,
      weatherCode: data.hourly?.weather_code?.[index] ?? null,
      temp: data.hourly?.temperature_2m?.[index] ?? null,
      precipChance: data.hourly?.precipitation_probability?.[index] ?? null,
    }),
  );

  const result = { timezone: data.timezone ?? null, days, hours };
  return result;
}
