import type { DayForecast, HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import { WEATHER_BANNER_IMAGES } from '@apps/waypoint/constants';
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
  const bannerImage = WEATHER_BANNER_IMAGES[condition.id];

  if (isMinimized) {
    return (
      <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
        <WeatherEmoji condition={condition} className='shrink-0 text-sm leading-none' />
        {label} · {formatTemp(forecast.tempMax)} / {formatTemp(forecast.tempMin)}
      </span>
    );
  }

  return (
    <div className='bg-muted/50 overflow-hidden rounded-lg'>
      <div className='relative p-3'>
        {bannerImage && (
          <img
            src={bannerImage}
            alt=''
            aria-hidden='true'
            loading='lazy'
            decoding='async'
            className='absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-50 [mask-image:linear-gradient(to_right,transparent,black_60%)] sm:w-3/4'
          />
        )}
        <div className='relative flex items-center gap-3'>
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
      </div>
      {hours.length > 0 && (
        <div className='px-3 pb-3'>
          <HourlyWeatherStrip hours={hours} />
        </div>
      )}
    </div>
  );
}

export default DayWeather;
