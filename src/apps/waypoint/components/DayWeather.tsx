import type { DayForecast, HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import HourlyWeatherStrip from '@apps/waypoint/components/HourlyWeatherStrip';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

interface DayWeatherProps {
  forecast: DayForecast;
  hours?: HourForecast[];
  isMinimized: boolean;
}

const formatTemp = (value: number | null) => (value === null ? '–' : `${Math.round(value)}°`);

function DayWeather({ forecast, hours = [], isMinimized }: DayWeatherProps) {
  const condition = getWeatherCondition(forecast.weatherCode);
  const { label } = condition;

  if (isMinimized) {
    return (
      <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
        <WeatherEmoji condition={condition} className='shrink-0 text-sm leading-none' />
        {label} · {formatTemp(forecast.tempMax)} / {formatTemp(forecast.tempMin)}
      </span>
    );
  }

  return (
    <div className='bg-muted/50 space-y-2 rounded-lg p-3'>
      <div className='flex items-center gap-3'>
        <span className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
          <WeatherEmoji condition={condition} className='text-xl leading-none' />
        </span>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>{label}</p>
          <p className='text-muted-foreground text-xs'>
            High {formatTemp(forecast.tempMax)} · Low {formatTemp(forecast.tempMin)}
            {forecast.precipChance !== null && forecast.precipChance > 0 && ` · ${forecast.precipChance}% chance of precipitation`}
          </p>
        </div>
      </div>
      {hours.length > 0 && <HourlyWeatherStrip hours={hours} />}
    </div>
  );
}

export default DayWeather;
