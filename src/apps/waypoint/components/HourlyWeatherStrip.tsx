import { useLayoutEffect, useRef } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

interface HourlyWeatherStripProps {
  hours: HourForecast[];
  /** Labels the first hour "Now"; off for a whole day, whose first hour is midnight. */
  showNow?: boolean;
}

const FIRST_VISIBLE_HOUR = 7;
const HOUR_CELL_WIDTH = 60;

const formatHourLabel = (time: string) => {
  const hour = Number(time.slice(11, 13));
  const result = `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
  return result;
};

function HourlyWeatherStrip({ hours, showNow = true }: HourlyWeatherStripProps) {
  const showPrecip = hours.some((hour) => hour.precipChance !== null && hour.precipChance >= 20);
  const listRef = useRef<HTMLUListElement>(null);
  const firstDaytimeIndex = Math.max(0, hours.findIndex((hour) => Number(hour.time.slice(11, 13)) >= FIRST_VISIBLE_HOUR));

  useLayoutEffect(() => {
    if (showNow || !listRef.current) {
      return;
    }
    listRef.current.scrollLeft = firstDaytimeIndex * HOUR_CELL_WIDTH;
  }, [showNow, firstDaytimeIndex]);

  return (
    <ul
      ref={listRef}
      className='-mx-1 flex gap-1 overflow-x-auto px-1'
      aria-label='Hour by hour weather'
    >
      {hours.map((hour, index) => {
        const condition = getWeatherCondition(hour.weatherCode);
        const { label } = condition;
        const isNow = showNow && index === 0;
        const timeLabel = isNow ? 'Now' : formatHourLabel(hour.time);
        const tempLabel = hour.temp === null ? 'temperature unavailable' : `${Math.round(hour.temp)} degrees`;
        return (
          <li
            key={hour.time}
            title={label}
            aria-label={`${timeLabel}: ${label}, ${tempLabel}`}
            className={join(
              'flex w-14 shrink-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-xs',
              isNow && 'bg-primary/10',
            )}
          >
            <span
              className={join(
                'text-muted-foreground leading-4 whitespace-nowrap',
                isNow && 'text-foreground font-medium',
              )}
            >
              {timeLabel}
            </span>
            <WeatherEmoji condition={condition} className='h-5 shrink-0 text-base leading-5' />
            <span className='leading-4 font-medium'>{hour.temp === null ? '–' : `${Math.round(hour.temp)}°`}</span>
            {showPrecip && (
              <span className='text-muted-foreground h-3.5 text-[10px] leading-3.5'>
                {hour.precipChance !== null && hour.precipChance >= 20 ? `${hour.precipChance}%` : ''}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default HourlyWeatherStrip;
