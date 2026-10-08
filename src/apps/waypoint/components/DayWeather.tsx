import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, MapPin } from 'lucide-react';

import type { DayForecast, HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import { WEATHER_BANNER_IMAGES } from '@apps/waypoint/constants';
import HourlyWeatherStrip from '@apps/waypoint/components/HourlyWeatherStrip';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

interface DayWeatherProps {
  forecast: DayForecast;
  hours?: HourForecast[];
  /** Set when the weather isn't simply the trip city's: which place it is for. */
  placeName?: string | null;
  /** The day's other places, in the order their first plan happens. */
  also?: { key: string; placeName: string | null; forecast: DayForecast }[];
  isMinimized: boolean;
  onOpen?: () => void;
}

const formatTemp = (value: number | null) => (value === null ? '–' : `${Math.round(value)}°`);

function DayWeather({ forecast, hours = [], placeName = null, also = [], isMinimized, onOpen }: DayWeatherProps) {
  const condition = getWeatherCondition(forecast.weatherCode);
  const { label } = condition;
  const bannerImage = WEATHER_BANNER_IMAGES[condition.id];

  if (isMinimized) {
    const chip = (
      <>
        <WeatherEmoji condition={condition} className='shrink-0 text-sm leading-none' />
        {label} · {formatTemp(forecast.tempMax)} / {formatTemp(forecast.tempMin)}
        {also.length > 0 && (
          <span className='font-medium' title={`${also.length} more ${also.length === 1 ? 'place' : 'places'} on this day`}>
            {' '}
            · +{also.length}
          </span>
        )}
      </>
    );
    return onOpen ? (
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        aria-label={`Open the day's weather: ${label}${placeName ? ` in ${placeName}` : ''}${also.length > 0 ? `, plus ${also.length} more ${also.length === 1 ? 'place' : 'places'}` : ''}`}
        className="text-muted-foreground relative h-auto gap-1.5 p-0! text-xs font-normal after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
        onClick={onOpen}
      >
        {chip}
      </Button>
    ) : (
      <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>{chip}</span>
    );
  }

  const summary = (
    <div className='relative w-full p-3'>
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
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>{label}</p>
          <p className='text-muted-foreground text-xs'>
            High {formatTemp(forecast.tempMax)} · Low {formatTemp(forecast.tempMin)}
            {forecast.precipChance !== null && forecast.precipChance > 0 && ` · ${forecast.precipChance}% chance of precipitation`}
          </p>
          {placeName && (
            <p className='text-muted-foreground mt-0.5 flex items-center gap-1 text-xs'>
              <MapPin className='h-3 w-3 shrink-0' aria-hidden='true' />
              <span className='truncate'>{placeName}</span>
            </p>
          )}
        </div>
        {onOpen && <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />}
      </div>
    </div>
  );

  return (
    <div className='bg-muted/50 overflow-hidden rounded-lg'>
      {onOpen ? (
        <Button
          type='button'
          variant='tertiary'
          aria-label={`Open the day's weather: ${label}`}
          className='h-auto w-full justify-start rounded-none p-0! text-left font-normal'
          onClick={onOpen}
        >
          {summary}
        </Button>
      ) : (
        summary
      )}
      {also.length > 0 && (
        <div className='flex flex-wrap gap-1.5 px-3 pb-3'>
          {also.map(({ key, placeName: alsoPlace, forecast: alsoForecast }) => {
            const alsoCondition = getWeatherCondition(alsoForecast.weatherCode);
            return (
              <span
                key={key}
                className='bg-background/70 text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs'
              >
                <span className='shrink-0'>Also</span>
                <span className='text-foreground truncate font-medium'>{alsoPlace ?? 'another place'}</span>
                <WeatherEmoji condition={alsoCondition} className='shrink-0 text-sm leading-none' />
                <span className='shrink-0'>
                  {formatTemp(alsoForecast.tempMax)} / {formatTemp(alsoForecast.tempMin)}
                </span>
              </span>
            );
          })}
        </div>
      )}
      {hours.length > 0 && (
        <div className='px-3 pb-3'>
          <HourlyWeatherStrip hours={hours} />
        </div>
      )}
    </div>
  );
}

export default DayWeather;
