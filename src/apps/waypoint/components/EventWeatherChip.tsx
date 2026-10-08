import type { HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

interface EventWeatherChipProps {
  weather: HourForecast;
  /** Set only when the event is outside the day's main place. */
  placeName?: string | null;
}

function EventWeatherChip({ weather, placeName = null }: EventWeatherChipProps) {
  const condition = getWeatherCondition(weather.weatherCode);
  const { label } = condition;
  const hasRain = weather.precipChance !== null && weather.precipChance >= 30;
  const accessibleLabel = [
    label,
    weather.temp === null ? null : `${Math.round(weather.temp)} degrees`,
    weather.precipChance === null ? null : `${weather.precipChance}% chance of precipitation`,
    placeName,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <span
      role='img'
      aria-label={accessibleLabel}
      title={placeName ? `${label} in ${placeName}` : label}
      className='text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs'
    >
      <WeatherEmoji condition={condition} className='text-sm leading-none' />
      {weather.temp === null ? label : `${Math.round(weather.temp)}°`}
      {hasRain && ` · ${weather.precipChance}%`}
      {placeName && <span className='min-w-0 max-w-28 truncate'> · {placeName}</span>}
    </span>
  );
}

export default EventWeatherChip;
