import { useState } from 'react';

import { Button, Calendar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SegmentedControl from '@/components/SegmentedControl';
import {
  formatDayRuns,
  getDaysBetween,
  normalizeDays,
} from '@/utils/dayRunUtils';

type TapMode = 'DAY' | 'STRETCH';

const TAP_MODES = [
  { value: 'DAY', label: 'One day' },
  { value: 'STRETCH', label: 'A stretch' },
] as const;

// The calendar's own selection is cleared so only the days drawn in each cell show as picked.
const CALENDAR_STYLES = {
  containerClassName: 'h-auto!',
  cellClassName: 'p-0 hover:bg-transparent focus:bg-transparent',
  selectedCellClassName: 'bg-transparent! text-foreground!',
  todayCellClassName: 'border-0',
};

const toDay = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const toCellDate = (day: number) => {
  const date = new Date(day);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

interface DaysPickerProps {
  /** Date-only values (UTC midnight). */
  days: number[];
  onChange: (days: number[]) => void;
  /** The first day that can be picked, a date-only value. */
  minDay: number;
  maxDays: number;
}

/** Several days on one calendar: a tap adds or removes a day, and in "A stretch" a first and a last tap add every day between. */
function DaysPicker({ days, onChange, minDay, maxDays }: DaysPickerProps) {
  const [mode, setMode] = useState<TapMode>('DAY');
  const [anchor, setAnchor] = useState<number | null>(null);
  const [isFull, setIsFull] = useState(false);
  const picked = new Set(days);

  const add = (more: number[]) => {
    const next = normalizeDays([...days, ...more]);
    setIsFull(next.length > maxDays);
    onChange(next.slice(0, maxDays));
  };

  const tap = (date: Date) => {
    const day = toDay(date);
    if (day < minDay) return;
    if (mode === 'DAY') {
      if (picked.has(day)) {
        setIsFull(false);
        onChange(days.filter((kept) => kept !== day));
        return;
      }
      add([day]);
      return;
    }
    if (anchor === null) {
      setAnchor(day);
      return;
    }
    setAnchor(null);
    add(getDaysBetween(anchor, day));
  };

  const changeMode = (next: TapMode) => {
    setAnchor(null);
    setMode(next);
  };

  const getLine = () => {
    if (isFull) return `That's the most it holds: ${maxDays} days.`;
    if (anchor !== null)
      return `From ${formatDayRuns([anchor])}. Now tap the last day.`;
    if (days.length === 0)
      return mode === 'DAY'
        ? 'Tap each day to add it.'
        : 'Tap the first and last day.';
    return `${formatDayRuns(days)} · ${days.length} ${days.length === 1 ? 'day' : 'days'}`;
  };

  return (
    <div className='space-y-3'>
      <SegmentedControl
        label='What a tap adds'
        options={TAP_MODES}
        value={mode}
        onChange={changeMode}
      />
      <Calendar
        mode='single'
        size='auto'
        className='mx-auto w-full max-w-sm'
        initialDate={toCellDate(days.find((day) => day >= minDay) ?? minDay)}
        minDate={toCellDate(minDay)}
        customStyles={CALENDAR_STYLES}
        onDateSelect={tap}
        renderCell={(date, _isSelected, isDisabled, isToday) => {
          const day = toDay(date);
          const isPicked = picked.has(day);
          return (
            <span
              className={join(
                'flex h-9 w-full items-center justify-center rounded-full',
                isPicked && 'bg-primary text-primary-foreground font-semibold',
                day === anchor &&
                  'font-semibold shadow-[inset_0_0_0_2px_var(--color-primary)]',
                isToday && !isPicked && 'font-semibold',
                isDisabled && 'opacity-40',
              )}
            >
              {date.getDate()}
            </span>
          );
        }}
      />
      <div className='flex min-h-10 items-center gap-2'>
        <p
          className={join(
            'min-w-0 flex-1 text-sm text-pretty',
            days.length === 0 || anchor !== null
              ? 'text-muted-foreground'
              : 'font-medium',
          )}
          aria-live='polite'
        >
          {getLine()}
        </p>
        {days.length > 0 && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='shrink-0'
            onClick={() => {
              setAnchor(null);
              setIsFull(false);
              onChange([]);
            }}
          >
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}

export default DaysPicker;
