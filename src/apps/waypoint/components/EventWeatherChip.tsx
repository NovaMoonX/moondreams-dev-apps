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

  return (
    <span className='text-muted-foreground inline-flex items-center gap-1 text-xs' title={label}>
      <WeatherEmoji condition={condition} className='text-sm leading-none' />
      {weather.temp === null ? label : `${Math.round(weather.temp)}°`}
      {hasRain && ` · ${weather.precipChance}%`}
    </span>
  );
}

export default EventWeatherChip;
