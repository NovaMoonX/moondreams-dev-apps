import { useId } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import {
  MultiPillGroup,
  PillGroup,
  type PillOption,
} from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import type { Weekday } from '@/utils/cadenceUtils';
import {
  HABIT_LABEL_MAX,
  HABIT_PER_DAY_MAX,
  HABIT_WINDOWS_MAX,
  HELM_COPY,
} from '@apps/helm/constants';
import type { DayPart } from '@apps/helm/engine/habitDay';
import {
  DAY_PARTS,
  isValidWindow,
  toPartWindow,
  WEEK_ORDER,
  type DraftWindow,
  type OftenKind,
  type WhenDraft,
  type WhenMode,
} from '@apps/helm/utils/habitDraft';

interface HabitWhenFieldsProps {
  draft: WhenDraft;
  profile: { dayStartTime: string; dayEndTime: string };
  /** The question each group answers is asked by the caller; these are the answers only. */
  onChange: (draft: WhenDraft) => void;
}

const OFTEN: readonly PillOption<OftenKind>[] = [
  { value: 'everyDay', label: HELM_COPY.habitOftenEveryDay },
  { value: 'onWeekdays', label: HELM_COPY.habitOftenDays },
  { value: 'timesPerWeek', label: HELM_COPY.habitOftenWeek },
];

const MODES: readonly PillOption<WhenMode>[] = [
  { value: 'parts', label: HELM_COPY.habitModeParts },
  { value: 'anyTime', label: HELM_COPY.habitModeAny },
  { value: 'count', label: HELM_COPY.habitModeCount },
];

const WEEKDAY_OPTIONS: readonly PillOption<`${Weekday}`>[] = WEEK_ORDER.map(
  (day) => ({
    value: `${day}` as `${Weekday}`,
    label: HELM_COPY.habitWeekdaysShort[day],
    ariaLabel: HELM_COPY.habitWeekdaysLong[day],
  }),
);

const PART_OPTIONS: readonly PillOption<DayPart>[] = DAY_PARTS.map((part) => ({
  value: part,
  label: HELM_COPY.habitPartLabels[part],
}));

interface WindowRowProps {
  window: DraftWindow;
  onChange: (window: DraftWindow) => void;
  onRemove: () => void;
}

function WindowRow({ window, onChange, onRemove }: WindowRowProps) {
  const fieldId = useId();
  return (
    <div className='border-border space-y-2 rounded-xl border p-3'>
      <div className='flex items-center gap-3'>
        <Input
          variant='outline'
          className='helm-field min-w-0 flex-1'
          aria-label={HELM_COPY.habitWindowName}
          maxLength={HABIT_LABEL_MAX}
          value={window.label}
          onChange={(event) =>
            onChange({ ...window, label: event.target.value })
          }
        />
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          className="relative size-8 shrink-0 after:absolute after:-inset-1 after:content-['']"
          aria-label={HELM_COPY.habitWindowRemove(window.label)}
          onClick={onRemove}
        >
          <X className='size-4' aria-hidden='true' />
        </Button>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1'>
          <label
            htmlFor={`${fieldId}-start`}
            className='text-muted-foreground text-xs'
          >
            {HELM_COPY.habitWhenStart}
          </label>
          <Input
            id={`${fieldId}-start`}
            type='time'
            variant='outline'
            className='helm-field'
            value={window.start}
            onChange={(event) =>
              onChange({ ...window, start: event.target.value })
            }
          />
        </div>
        <div className='space-y-1'>
          <label
            htmlFor={`${fieldId}-end`}
            className='text-muted-foreground text-xs'
          >
            {HELM_COPY.habitWhenEnd}
          </label>
          <Input
            id={`${fieldId}-end`}
            type='time'
            variant='outline'
            className='helm-field'
            aria-invalid={!isValidWindow(window)}
            value={window.end}
            onChange={(event) =>
              onChange({ ...window, end: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

/** How often and when in the day a habit asks for something: the same answers in the new-habit flow and in the sheet that changes them. */
export function OftenFields({
  draft,
  onChange,
}: Omit<HabitWhenFieldsProps, 'profile'>) {
  return (
    <div className='space-y-4'>
      <PillGroup
        label={HELM_COPY.habitWhenOftenLabel}
        options={OFTEN}
        value={draft.often}
        onChange={(often) => onChange({ ...draft, often })}
      />
      {draft.often === 'onWeekdays' && (
        <MultiPillGroup
          label={HELM_COPY.habitWhenWeekdaysLabel}
          options={WEEKDAY_OPTIONS}
          values={draft.weekdays.map((day) => `${day}` as `${Weekday}`)}
          showAll
          onChange={(values) =>
            onChange({
              ...draft,
              weekdays: values.map((value) => Number(value) as Weekday),
            })
          }
        />
      )}
      {draft.often === 'timesPerWeek' && (
        <div className='flex items-center justify-between gap-3'>
          <span className='text-[15px]'>
            {HELM_COPY.habitWhenWeekCountLabel}
          </span>
          <Stepper
            label={HELM_COPY.habitWhenWeekCountLabel}
            value={draft.weekCount}
            min={1}
            max={6}
            step={1}
            onChange={(weekCount) => onChange({ ...draft, weekCount })}
          />
        </div>
      )}
    </div>
  );
}

export function TimesFields({
  draft,
  profile,
  onChange,
}: HabitWhenFieldsProps) {
  const toggleParts = (parts: DayPart[]) => {
    const kept = draft.windows.filter(
      (window) => window.part === null || parts.includes(window.part),
    );
    const added = parts
      .filter((part) => !kept.some((window) => window.part === part))
      .map((part) => toPartWindow(part, profile));
    onChange({
      ...draft,
      windows: [...kept, ...added].slice(0, HABIT_WINDOWS_MAX),
    });
  };
  const selectedParts = draft.windows.flatMap((window) =>
    window.part ? [window.part] : [],
  );
  return (
    <div className='space-y-4'>
      <PillGroup
        label={HELM_COPY.habitWhenTimesLabel}
        options={MODES}
        value={draft.mode}
        onChange={(mode) => onChange({ ...draft, mode })}
      />
      {draft.mode === 'parts' && (
        <>
          <MultiPillGroup
            label={HELM_COPY.habitWhenTimesLabel}
            options={PART_OPTIONS}
            values={selectedParts}
            showAll
            onChange={toggleParts}
          />
          {draft.windows.map((window) => (
            <WindowRow
              key={window.id}
              window={window}
              onChange={(next) =>
                onChange({
                  ...draft,
                  windows: draft.windows.map((entry) =>
                    entry.id === window.id ? next : entry,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...draft,
                  windows: draft.windows.filter(
                    (entry) => entry.id !== window.id,
                  ),
                })
              }
            />
          ))}
        </>
      )}
      {draft.mode === 'count' && (
        <div className='flex items-center justify-between gap-3'>
          <span className='text-[15px]'>{HELM_COPY.habitWhenPerDayLabel}</span>
          <Stepper
            label={HELM_COPY.habitWhenPerDayLabel}
            value={draft.perDay}
            min={1}
            max={HABIT_PER_DAY_MAX}
            step={1}
            onChange={(perDay) => onChange({ ...draft, perDay })}
          />
        </div>
      )}
    </div>
  );
}
