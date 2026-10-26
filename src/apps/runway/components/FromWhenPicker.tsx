import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup } from '@/components/PillGroup';
import SummaryRow from '@/components/SummaryRow';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { CHANGE_WORDS, MAX_CHANGE_DAYS_AHEAD } from '@apps/runway/constants';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import { addUtcDays } from '@apps/runway/engine/dates';
import type { ItemKind } from '@apps/runway/types';
import type {
  FromWhenChoice,
  FromWhenValue,
} from '@apps/runway/utils/fromWhen';

interface FromWhenPickerProps {
  value: FromWhenValue;
  onChange: (value: FromWhenValue) => void;
  today: number;
  /** The income days ahead that can still be changed. */
  days: readonly ComingDay[];
  kind: ItemKind;
  /** The income day whose screen opened the form, if any. */
  presetDayKey: string | null;
  isDisabled?: boolean;
}

const STRETCH_OPTIONS = [
  { value: 'count', label: CHANGE_WORDS.stretchCount },
  { value: 'until', label: CHANGE_WORDS.stretchDate },
] as const;

const hasDayOnly = (kind: ItemKind) => kind === 'envelope' || kind === 'goal';

/** When a change starts and how long it lasts: opened on an income day's own screen with that day's choices first, and elsewhere folded to one row until tapped since "From now on" is nearly always right. Earlier days keep what they had; only choices that mean something here are drawn. */
function FromWhenPicker({
  value,
  onChange,
  today,
  days,
  kind,
  presetDayKey,
  isDisabled = false,
}: FromWhenPickerProps) {
  const preset = days.find((day) => day.dayKey === presetDayKey) ?? null;
  const dayFirst: { value: FromWhenChoice; label: string }[] = [
    ...(hasDayOnly(kind) && (preset || days.length > 0)
      ? [{ value: 'dayOnly' as const, label: CHANGE_WORDS.dayOnly }]
      : []),
    ...(preset && preset.on > today
      ? [{ value: 'fromDay' as const, label: CHANGE_WORDS.fromDay }]
      : []),
  ];
  const rest: { value: FromWhenChoice; label: string }[] = [
    { value: 'now', label: CHANGE_WORDS.fromNow },
    { value: 'date', label: CHANGE_WORDS.fromDate },
    ...(kind !== 'source'
      ? [{ value: 'stretch' as const, label: CHANGE_WORDS.stretch }]
      : []),
  ];
  const options =
    preset !== null
      ? [...dayFirst, ...rest]
      : [rest[0], ...dayFirst, ...rest.slice(1)];
  const [isOpen, setIsOpen] = useState(preset !== null);
  const dayOptions = days.map((day) => ({
    value: day.dayKey,
    label: `${formatDateUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));

  if (!isOpen) {
    const chosen =
      options.find((option) => option.value === value.choice)?.label ??
      CHANGE_WORDS.fromNow;
    return (
      <SummaryRow
        label={CHANGE_WORDS.fromHeading}
        ariaLabel={`${CHANGE_WORDS.fromHeading}: ${chosen}. Change`}
        onClick={isDisabled ? undefined : () => setIsOpen(true)}
      >
        {chosen}
      </SummaryRow>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs'>
        {CHANGE_WORDS.fromHeading}
      </p>
      <PillGroup
        label={CHANGE_WORDS.fromHeading}
        options={options}
        value={value.choice}
        onChange={(choice) => !isDisabled && onChange({ ...value, choice })}
      />
      {value.choice === 'fromDay' && preset && (
        <p className='text-muted-foreground text-sm'>
          {formatDateUTC(preset.on)}
        </p>
      )}
      {value.choice === 'dayOnly' && preset && (
        <p className='text-muted-foreground text-sm'>
          {formatDateUTC(preset.on)}
        </p>
      )}
      {value.choice === 'dayOnly' && !preset && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {CHANGE_WORDS.dayPick}
          </p>
          <PillGroup
            label={CHANGE_WORDS.dayPick}
            options={dayOptions}
            value={value.dayKey === '' ? null : value.dayKey}
            onChange={(dayKey) => !isDisabled && onChange({ ...value, dayKey })}
          />
        </div>
      )}
      {value.choice === 'date' && (
        <Input
          type='date'
          variant='outline'
          aria-label={CHANGE_WORDS.dateLabel}
          min={toDateInputValue(addUtcDays(today, 1))}
          max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
          value={value.date}
          disabled={isDisabled}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
      )}
      {value.choice === 'stretch' && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {CHANGE_WORDS.stretchHeading}
          </p>
          <PillGroup
            label={CHANGE_WORDS.stretchHeading}
            options={STRETCH_OPTIONS}
            value={value.stretch}
            onChange={(stretch) =>
              !isDisabled && onChange({ ...value, stretch })
            }
          />
          {value.stretch === 'count' ? (
            <Input
              type='number'
              inputMode='numeric'
              min={1}
              variant='outline'
              aria-label={CHANGE_WORDS.stretchCountLabel}
              placeholder='3'
              value={value.count}
              disabled={isDisabled}
              onChange={(event) =>
                onChange({ ...value, count: event.target.value })
              }
            />
          ) : (
            <Input
              type='date'
              variant='outline'
              aria-label={CHANGE_WORDS.stretchDateLabel}
              min={toDateInputValue(today)}
              max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
              value={value.until}
              disabled={isDisabled}
              onChange={(event) =>
                onChange({ ...value, until: event.target.value })
              }
            />
          )}
          <p className='text-muted-foreground text-sm'>
            {CHANGE_WORDS.stretchNote}
          </p>
        </div>
      )}
    </div>
  );
}

export default FromWhenPicker;
