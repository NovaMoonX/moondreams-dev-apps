import type { HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

interface EventWeatherChipProps {
  weather: HourForecast;
}

function EventWeatherChip({ weather }: EventWeatherChipProps) {
  const condition = getWeatherCondition(weather.weatherCode);
  const { label } = condition;
  const hasRain = weather.precipChance !== null && weather.precipChance >= 30;
  const accessibleLabel = [
    label,
    weather.temp === null ? null : `${Math.round(weather.temp)} degrees`,
    weather.precipChance === null ? null : `${weather.precipChance}% chance of precipitation`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <span
      role='img'
      aria-label={accessibleLabel}
      title={label}
      className='text-muted-foreground inline-flex items-center gap-1 text-xs'
    >
      <WeatherEmoji condition={condition} className='text-sm leading-none' />
      {weather.temp === null ? label : `${Math.round(weather.temp)}°`}
      {hasRain && ` · ${weather.precipChance}%`}
    </span>
  );
}

export default EventWeatherChip;
