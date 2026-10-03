import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { WeatherCondition } from '@/lib/weather/weatherCodes';

interface WeatherEmojiProps {
  condition: WeatherCondition;
  className?: string;
}

function WeatherEmoji({ condition, className }: WeatherEmojiProps) {
  if (!condition.hasMist) {
    return (
      <span className={className} aria-hidden='true'>
        {condition.emoji}
      </span>
    );
  }

  return (
    <span className={join('relative inline-block', className)} aria-hidden='true'>
      <span className='inline-block -translate-y-[0.12em] scale-90'>{condition.emoji}</span>
      <span className='absolute inset-x-[0.1em] bottom-[0.08em] flex flex-col gap-[0.09em]'>
        <span className='h-[0.07em] rounded-full bg-current opacity-60' />
        <span className='mx-[0.12em] h-[0.07em] rounded-full bg-current opacity-60' />
      </span>
    </span>
  );
}

export default WeatherEmoji;
