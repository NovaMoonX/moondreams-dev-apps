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
        {days.map(({ dayIndex, forecast }) => {
          const condition = getWeatherCondition(forecast.weatherCode);
          const isToday = dayIndex === todayIndex;
          const isSelected = dayIndex === selectedDayIndex;
          const weekday = new Date(startDate + dayIndex * DAY_MS).toLocaleDateString(undefined, {
            weekday: 'short',
            timeZone: 'UTC',
          });
          const dateLabel = getDayDateLabel(startDate, dayIndex);

          return (
            <Button
              key={dayIndex}
              type='button'
              variant='tertiary'
              data-today={isToday}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              aria-label={`${dateLabel}: ${condition.label}, high ${formatTemp(forecast.tempMax)}, low ${formatTemp(forecast.tempMin)}`}
              className={join(
                'h-auto min-w-18 flex-1 flex-col gap-1 rounded-md px-1 py-2 text-xs font-normal',
                dayIndex < todayIndex && 'opacity-60',
                isToday && 'bg-primary/10',
                isSelected && (isToday ? 'bg-primary/20' : 'bg-muted'),
              )}
              onClick={() => onSelectDay(dayIndex)}
            >
              <span className={join('leading-4', isToday ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                {isToday ? 'Today' : weekday}
              </span>
              <span className='text-muted-foreground text-[10px] leading-3'>{dateLabel}</span>
              <WeatherEmoji condition={condition} className='h-5 text-base leading-5' />
              <span className='leading-4 font-medium whitespace-nowrap'>
                {formatTemp(forecast.tempMax)}
                <span className='text-muted-foreground font-normal'> / {formatTemp(forecast.tempMin)}</span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default WeatherDayStrip;
