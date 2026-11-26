import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';

interface DurationFieldProps {
  label: string;
  /** Whole minutes, or null while both boxes are empty. Read once: give the field a new `key` to start it from another value. */
  minutes: number | null;
  onChange: (minutes: number | null) => void;
  maxHours?: number;
  /** A smaller caption and 40px boxes, for a grid of short fields. */
  isCompact?: boolean;
}

const NUMBER_CLASS =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const toText = (value: number) => (value === 0 ? '' : String(value));
const digitsOnly = (text: string) => text.replace(/\D/g, '').slice(0, 4);

const splitMinutes = (minutes: number | null) =>
  minutes === null
    ? { hours: '', minutes: '' }
    : {
        hours: toText(Math.floor(minutes / 60)),
        minutes: minutes === 0 ? '0' : toText(minutes % 60),
      };

/** How long something takes, typed as hours and minutes side by side and handed back as whole minutes; minutes past 59 fold into hours when the box is left. */
function DurationField({
  label,
  minutes,
  onChange,
  maxHours = 999,
  isCompact = false,
}: DurationFieldProps) {
  const [text, setText] = useState(() => splitMinutes(minutes));

  const getTotal = (next: { hours: string; minutes: string }) =>
    next.hours === '' && next.minutes === ''
      ? null
      : Math.min(
          maxHours * 60 + 59,
          Number(next.hours || 0) * 60 + Number(next.minutes || 0),
        );

  const change = (patch: Partial<typeof text>) => {
    const next = { ...text, ...patch };
    setText(next);
    onChange(getTotal(next));
  };

  const foldMinutes = () => {
    const total = getTotal(text);
    if (total !== null && Number(text.minutes || 0) >= 60) {
      setText(splitMinutes(total));
    }
  };

  const box = (
    part: 'hours' | 'minutes',
    suffix: string,
    spokenPart: string,
  ) => (
    <div className='relative min-w-0 flex-1'>
      <Input
        type='text'
        inputMode='numeric'
        autoComplete='off'
        variant='outline'
        aria-label={`${label}, ${spokenPart}`}
        className={join(
          NUMBER_CLASS,
          isCompact && COMPACT_INPUT_CLASS,
          'pl-3!',
          isCompact
            ? part === 'hours'
              ? 'pr-5!'
              : 'pr-8!'
            : part === 'hours'
              ? 'pr-6!'
              : 'pr-9!',
        )}
        value={text[part]}
        placeholder='0'
        onChange={(event) => change({ [part]: digitsOnly(event.target.value) })}
        onBlur={part === 'minutes' ? foldMinutes : undefined}
      />
      <span
        className={join(
          'text-muted-foreground pointer-events-none absolute inset-y-0 flex items-center',
          'right-2.5',
          isCompact ? 'text-xs' : 'text-sm',
        )}
        aria-hidden='true'
      >
        {suffix}
      </span>
    </div>
  );

  return (
    <fieldset
      className={join('min-w-0', isCompact ? 'space-y-1' : 'space-y-1.5')}
    >
      <legend
        className={join(
          'mb-1 block font-medium',
          isCompact && 'text-muted-foreground text-xs',
        )}
      >
        {label}
      </legend>
      <div className='flex gap-2'>
        {box('hours', 'h', 'hours')}
        {box('minutes', 'min', 'minutes')}
      </div>
    </fieldset>
  );
}

export default DurationField;
