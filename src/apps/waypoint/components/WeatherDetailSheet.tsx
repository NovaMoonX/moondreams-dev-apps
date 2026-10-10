import { Button } from '@moondreamsdev/dreamer-ui/components';
import { MapPin } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import type { DayForecast, HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import HourlyWeatherStrip from '@apps/waypoint/components/HourlyWeatherStrip';
import WeatherAttribution from '@apps/waypoint/components/WeatherAttribution';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';
import { WEATHER_BANNER_IMAGES } from '@apps/waypoint/constants';

export interface WeatherDayDetails {
  forecast: DayForecast;
  hours: HourForecast[];
  placeName: string | null;
  also?: { key: string; placeName: string | null; forecast: DayForecast }[];
}

interface WeatherDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  details: WeatherDayDetails | null;
}

const formatTemp = (value: number | null) => (value === null ? '–' : `${Math.round(value)}°`);

function WeatherDetailSheet({ isOpen, onClose, title, details }: WeatherDetailSheetProps) {
  if (!details) {
    return null;
  }

  const { forecast, hours, placeName, also = [] } = details;
  const condition = getWeatherCondition(forecast.weatherCode);
  const backdrop = WEATHER_BANNER_IMAGES[condition.id];
  const hasPrecip = forecast.precipChance !== null && forecast.precipChance > 0;

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className='flex items-center gap-2'>
          <Button type='button' size='lg' className='flex-1' onClick={onClose}>
            Sounds good
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <div className='bg-muted relative isolate overflow-hidden rounded-xl'>
          {backdrop && (
            <img
              src={backdrop}
              alt=''
              aria-hidden='true'
              decoding='async'
              className='absolute inset-0 -z-10 h-full w-full object-cover'
            />
          )}
          <div className='flex min-h-40 flex-col justify-end gap-2 bg-linear-to-t from-black/75 via-black/40 to-black/10 p-4 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]'>
            <div className='flex items-center gap-3'>
              <WeatherEmoji condition={condition} className='text-4xl leading-none' />
              <div className='min-w-0'>
                <p className='text-lg leading-tight font-semibold'>{condition.label}</p>
                <p className='text-sm text-white/85'>
                  High {formatTemp(forecast.tempMax)} · Low {formatTemp(forecast.tempMin)}
                </p>
              </div>
            </div>
            {hasPrecip && <p className='text-sm text-white/85'>{forecast.precipChance}% chance of precipitation</p>}
            {placeName && (
              <p className='flex items-start gap-1.5 text-sm text-white/85'>
                <MapPin className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
                <span className='min-w-0'>
                  Based on{' '}
                  <span className='font-medium text-white'>{placeName}</span>
                </span>
              </p>
            )}
          </div>
        </div>
        {hours.length > 0 && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Hour by hour</p>
            <HourlyWeatherStrip hours={hours} showNow={false} />
          </div>
        )}
        {also.length > 0 && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Also on this day</p>
            <ul className='divide-border divide-y'>
              {also.map(({ key, placeName: alsoPlace, forecast: alsoForecast }) => {
                const alsoCondition = getWeatherCondition(alsoForecast.weatherCode);
                return (
                  <li key={key} className='flex items-center gap-3 py-2'>
                    <WeatherEmoji condition={alsoCondition} className='text-2xl leading-none' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>{alsoPlace ?? 'Another place'}</span>
                      <span className='text-muted-foreground block text-xs'>{alsoCondition.label}</span>
                    </span>
                    <span className='shrink-0 text-sm tabular-nums'>
                      {formatTemp(alsoForecast.tempMax)} / {formatTemp(alsoForecast.tempMin)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <WeatherAttribution />
      </div>
    </DetailSheet>
  );
}

export default WeatherDetailSheet;
