import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import RepeatSummary from '@/components/RepeatSummary';
import type { useRepeatPicker } from '@/hooks/useRepeatPicker';

interface RepeatPickerProps {
  picker: ReturnType<typeof useRepeatPicker>;
}

/** The "How often" field with the rule in words under it; tapping it swaps the host sheet to the presets (see `useRepeatPicker`). */
function RepeatPicker({ picker }: RepeatPickerProps) {
  const { startsOn, time, value, timeFormat, label, fieldText, open } = picker;
  return (
    <div className='flex flex-col gap-2'>
      <p className='text-[13px] font-semibold'>{label}</p>
      <Button
        type='button'
        variant='tertiary'
        onClick={open}
        aria-label={`${label}: ${fieldText}`}
        className='bg-card border-border text-foreground! h-12 w-full justify-between rounded-[10px] border px-3! text-[15px] font-normal'
      >
        <span className='truncate'>{fieldText}</span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <RepeatSummary
        rule={value}
        startsOn={startsOn}
        time={time}
        timeFormat={timeFormat}
      />
    </div>
  );
}

export default RepeatPicker;
