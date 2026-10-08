import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { DayForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import { getDayDateLabel } from '@/utils/dateRangeUtils';
import WeatherEmoji from '@apps/waypoint/components/WeatherEmoji';

export interface WeatherStripDay {
  dayIndex: number;
  forecast: DayForecast;
  /** How many other places the day's plans are in. */
  extra?: number;
  /** Where the day's forecast is for. */
  placeName?: string | null;
}

interface WeatherDayStripProps {
  days: WeatherStripDay[];
  startDate: number;
  todayIndex: number;
  selectedDayIndex: number | null;
  onSelectDay: (dayIndex: number) => void;
}

const DAY_MS = 86_400_000;

const formatTemp = (value: number | null) => (value === null ? '–' : `${Math.round(value)}°`);

function WeatherDayStrip({ days, startDate, todayIndex, selectedDayIndex, onSelectDay }: WeatherDayStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const today = container?.querySelector<HTMLElement>('[data-today="true"]');
    if (!container || !today) {
      return;
    }
    container.scrollLeft = today.offsetLeft - (container.clientWidth - today.offsetWidth) / 2;
  }, [days.length, todayIndex]);

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Weather by day</p>
      <div ref={containerRef} className='relative -mx-1 flex gap-1 overflow-x-auto px-1 py-1'>
        {days.map(({ dayIndex, forecast, extra = 0, placeName = null }) => {
          const condition = getWeatherCondition(forecast.weatherCode);
          const isToday = dayIndex === todayIndex;
          const isSelected = dayIndex === selectedDayIndex;
          const weekday = new Date(startDate + dayIndex * DAY_MS).toLocaleDateString(undefined, {
            weekday: 'short',
            timeZone: 'UTC',
          });
          const dateLabel = getDayDateLabel(startDate, dayIndex, false);

          return (
            <Button
              key={dayIndex}
              type='button'
              variant='tertiary'
              data-today={isToday}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              aria-label={`${dateLabel}: ${condition.label}, high ${formatTemp(forecast.tempMax)}, low ${formatTemp(forecast.tempMin)}${placeName ? `, in ${placeName}` : ''}${extra > 0 ? `, plus ${extra} more ${extra === 1 ? 'place' : 'places'}` : ''}`}
              className={join(
                'relative h-auto min-w-18 flex-1 flex-col justify-start gap-1 rounded-md px-1 py-2 text-xs font-normal focus:outline-transparent! focus-visible:outline-foreground!',
                dayIndex < todayIndex && 'opacity-60',
                isToday && 'bg-primary/10',
              )}
              onClick={() => onSelectDay(dayIndex)}
            >
              {isSelected && (
                <span aria-hidden='true' className='bg-foreground absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full' />
              )}
              <span className={join('leading-4', isToday ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                {isToday ? 'Today' : weekday}
              </span>
              <span className='text-muted-foreground text-[10px] leading-3'>{dateLabel}</span>
              <WeatherEmoji condition={condition} className='h-5 text-base leading-5' />
              <span className='leading-4 font-medium whitespace-nowrap'>
                {formatTemp(forecast.tempMax)}
                <span className='text-muted-foreground font-normal'> / {formatTemp(forecast.tempMin)}</span>
              </span>
              {placeName && (
                <span className='text-muted-foreground max-w-full truncate px-1 text-[10px] leading-3' title={placeName}>
                  {placeName}
                </span>
              )}
              {extra > 0 && <span className='text-muted-foreground/60 text-[10px] leading-3'>+{extra} more</span>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default WeatherDayStrip;
