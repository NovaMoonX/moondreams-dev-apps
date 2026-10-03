import type { HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';

interface EventWeatherChipProps {
  weather: HourForecast;
}

function EventWeatherChip({ weather }: EventWeatherChipProps) {
  const { label, icon: Icon } = getWeatherCondition(weather.weatherCode);
  const hasRain = weather.precipChance !== null && weather.precipChance >= 30;

  return (
    <span className='text-muted-foreground inline-flex items-center gap-1 text-xs' title={label}>
      <Icon className='h-3.5 w-3.5' aria-hidden='true' />
      {weather.temp === null ? label : `${Math.round(weather.temp)}°`}
      {hasRain && ` · ${weather.precipChance}%`}
    </span>
  );
}

export default EventWeatherChip;
