import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';

import { PillGroup } from '@/components/PillGroup';
import { ActionSection } from '@apps/runway/components/ActionSection';
import SummaryRow from '@/components/SummaryRow';
import { toDateInputValue } from '@/utils/dateInputUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { CHANGE_WORDS, MAX_CHANGE_DAYS_AHEAD } from '@apps/runway/constants';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import { addUtcDays } from '@apps/runway/engine/dates';
import type { ItemKind } from '@apps/runway/types';
import {
  getFromWhenOptions,
  type FromWhenValue,
} from '@apps/runway/utils/fromWhen';
import DateInput from '@/components/DateInput';

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
  /** The change is planned for a later day (Plan a change): only later starts are offered and they are asked in place. */
  isPlanning?: boolean;
  /** A pause is always for a while, so only its dates and length are asked. */
  isPause?: boolean;
}

const STRETCH_OPTIONS = [
  { value: 'count', label: CHANGE_WORDS.stretchCount },
  { value: 'until', label: CHANGE_WORDS.stretchDate },
] as const;

/** When a change starts and how long it lasts. An everyday edit starts now and only says so; a change planned ahead asks its later start in place, and a pause keeps its one row whose choices open in their own sheet. A change opened from an income day's screen asks when it starts in its own step after the form. Earlier days keep what they had. */
function FromWhenPicker({
  value,
  onChange,
  today,
  days,
  kind,
  presetDayKey,
  isDisabled = false,
  isPlanning = false,
  isPause = false,
}: FromWhenPickerProps) {
  const preset = days.find((day) => day.dayKey === presetDayKey) ?? null;
  const options = getFromWhenOptions({
    kind,
    days,
    presetDayKey,
    today,
    isPlanning,
  });
  const [isOpen, setIsOpen] = useState(false);
  const dayOptions = days.map((day) => ({
    value: day.dayKey,
    label: `${formatDateOrdinalUTC(day.on)} · ${day.sourceName ?? day.payLineName}`,
  }));

  const chosen =
    options.find((option) => option.value === value.choice)?.label ??
    CHANGE_WORDS.fromNow;
  const isFixed = !isPlanning && options.length < 2;
  const isEveryday = !isPlanning && !isPause;

  const controls = (
    <div className='space-y-4'>
      {!isPause && (
        <PillGroup
          label={CHANGE_WORDS.fromHeading}
          options={options}
          value={value.choice}
          onChange={(choice) => !isDisabled && onChange({ ...value, choice })}
        />
      )}
      {value.choice === 'fromDay' && preset && (
        <p className='text-muted-foreground text-sm'>
          {formatDateOrdinalUTC(preset.on)}
        </p>
      )}
      {value.choice === 'dayOnly' && preset && (
        <p className='text-muted-foreground text-sm'>
          {formatDateOrdinalUTC(preset.on)}
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
        <DateInput
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
            {CHANGE_WORDS.stretchStartHeading}
          </p>
          <DateInput
            variant='outline'
            aria-label={CHANGE_WORDS.stretchStartLabel}
            min={toDateInputValue(today)}
            max={toDateInputValue(addUtcDays(today, MAX_CHANGE_DAYS_AHEAD))}
            value={value.date}
            disabled={isDisabled}
            onChange={(event) =>
              onChange({ ...value, date: event.target.value })
            }
          />
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
            <DateInput
              variant='outline'
              aria-label={CHANGE_WORDS.stretchDateLabel}
              min={value.date || toDateInputValue(today)}
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

  if (isPlanning) {
    return (
      <ActionSection caption={CHANGE_WORDS.fromHeading}>
        {controls}
      </ActionSection>
    );
  }

  if (isEveryday && preset !== null && options.length > 1) return null;
  if (isEveryday && value.choice === 'now') {
    return (
      <p className='text-muted-foreground text-xs text-pretty'>
        {CHANGE_WORDS.fromNowNote}
      </p>
    );
  }

  return (
    <>
      <SummaryRow
        label={CHANGE_WORDS.fromHeading}
        ariaLabel={
          isFixed
            ? `${CHANGE_WORDS.fromHeading}: ${chosen}`
            : `${CHANGE_WORDS.fromHeading}: ${chosen}. Change`
        }
        onClick={isDisabled || isFixed ? undefined : () => setIsOpen(true)}
      >
        {chosen}
      </SummaryRow>
      {isOpen && (
        <FormSheet
          isOpen
          onClose={() => setIsOpen(false)}
          title={CHANGE_WORDS.fromHeading}
        >
          <div className='pb-4'>{controls}</div>
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={() => setIsOpen(false)}>
                Done
              </Button>
            }
          />
        </FormSheet>
      )}
    </>
  );
}

export default FromWhenPicker;
