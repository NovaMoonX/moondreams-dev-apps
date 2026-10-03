import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { HourForecast } from '@/lib/weather/types';
import { getWeatherCondition } from '@/lib/weather/weatherCodes';
import { formatClockTime } from '@/utils/formatUtils';

interface HourlyWeatherStripProps {
  /** Hours from the current one onward — the first reads as "Now". */
  hours: HourForecast[];
}

function HourlyWeatherStrip({ hours }: HourlyWeatherStripProps) {
  return (
    <ul className='-mx-1 flex gap-1 overflow-x-auto px-1 pb-1' aria-label='Hour by hour weather'>
      {hours.map((hour, index) => {
        const { label, icon: Icon } = getWeatherCondition(hour.weatherCode);
        return (
          <li
            key={hour.time}
            title={label}
            className={join(
              'flex w-14 shrink-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-xs',
              index === 0 && 'bg-primary/10',
            )}
          >
            <span className={join('text-muted-foreground', index === 0 && 'text-foreground font-medium')}>
              {index === 0 ? 'Now' : formatClockTime(hour.time.slice(-5))}
            </span>
            <Icon className='h-4 w-4' aria-hidden='true' />
            <span className='font-medium'>{hour.temp === null ? '–' : `${Math.round(hour.temp)}°`}</span>
            {hour.precipChance !== null && hour.precipChance >= 20 && (
              <span className='text-muted-foreground text-[10px]'>{hour.precipChance}%</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default HourlyWeatherStrip;
