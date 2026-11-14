import { join } from '@moondreamsdev/dreamer-ui/utils';

import {
  describeRepeat,
  listOccurrences,
  type RepeatRule,
} from '@/utils/repeatRule';

const dayFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
const fullDay = dayFormat({ weekday: 'short', month: 'short', day: 'numeric' });
const fullDayYear = dayFormat({
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatNextDay = (key: string) =>
  (new Date(`${key}T00:00:00Z`).getUTCFullYear() === new Date().getUTCFullYear()
    ? fullDay
    : fullDayYear
  ).format(new Date(`${key}T00:00:00Z`));

interface RepeatSummaryProps {
  rule: RepeatRule | null;
  startsOn: string;
  time?: string | null;
  timeFormat?: (time: string) => string;
  className?: string;
}

/** The rule in words with its next three dates, for a form, a sheet's subtitle or a reply; the same line wherever a rule is shown. */
function RepeatSummary({
  rule,
  startsOn,
  time = null,
  timeFormat,
  className,
}: RepeatSummaryProps) {
  const dates = rule ? listOccurrences(rule, startsOn, { limit: 3 }) : [];
  return (
    <div
      className={join('bg-muted rounded-[14px] px-3.5 py-3', className)}
      aria-live='polite'
    >
      <p className='text-foreground text-[15px]'>
        {describeRepeat(rule, startsOn, { time, timeFormat })}
      </p>
      {dates.length > 0 && (
        <p className='text-muted-foreground mt-1 text-[13px]'>
          Next:{' '}
          {dates.map((key, index) => (
            <span key={key}>
              {index > 0 && ' · '}
              <span className='whitespace-nowrap'>{formatNextDay(key)}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default RepeatSummary;
