import { formatMonthShort } from '@/utils/formatUtils';

interface DateChipProps {
  /** An instant: the month and day are the viewer's local ones. */
  timestamp: number;
}

/** A tiny tear-off calendar page: month on top, day below. */
function DateChip({ timestamp }: DateChipProps) {
  return (
    <span className='border-border bg-card flex w-11 shrink-0 flex-col items-center overflow-hidden rounded-xl border text-center shadow-sm'>
      <span className='bg-primary text-primary-foreground w-full text-[10px] leading-4 font-semibold tracking-wide uppercase'>
        {formatMonthShort(timestamp)}
      </span>
      <span className='text-base leading-6 font-semibold tabular-nums'>
        {new Date(timestamp).getDate()}
      </span>
    </span>
  );
}

export default DateChip;
