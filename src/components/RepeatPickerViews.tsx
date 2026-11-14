import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import RepeatSummary from '@/components/RepeatSummary';
import ModalFooterActions from '@/components/ModalFooterActions';
import SegmentedControl from '@/components/SegmentedControl';
import Stepper from '@/components/Stepper';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import {
  describeRepeat,
  formatRepeatRule,
  listOccurrences,
  repeatFromParts,
  repeatPresets,
  REPEAT_CAPS,
  type RepeatFreq,
  type RepeatParts,
  type RepeatRule,
  type Weekday,
} from '@/utils/repeatRule';

type MonthBy = NonNullable<RepeatParts['monthBy']>;
type Nth = NonNullable<RepeatParts['nth']>;

const WEEKDAYS: { key: Weekday; name: string; letter: string }[] = [
  { key: 'SU', name: 'Sunday', letter: 'S' },
  { key: 'MO', name: 'Monday', letter: 'M' },
  { key: 'TU', name: 'Tuesday', letter: 'T' },
  { key: 'WE', name: 'Wednesday', letter: 'W' },
  { key: 'TH', name: 'Thursday', letter: 'T' },
  { key: 'FR', name: 'Friday', letter: 'F' },
  { key: 'SA', name: 'Saturday', letter: 'S' },
];
const ORDINALS: Record<Nth, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};
const UNIT_WORDS: Record<RepeatFreq, [string, string]> = {
  daily: ['Day', 'Days'],
  weekly: ['Week', 'Weeks'],
  monthly: ['Month', 'Months'],
  yearly: ['Year', 'Years'],
};
const FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const PICK_FILL_MS = 150;
const HEADING_CLASS = 'text-[22px] leading-tight font-semibold';
const LABEL_CLASS = 'text-[13px] font-semibold';

const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);
const weekdayOf = (key: string) => WEEKDAYS[toDate(key).getUTCDay()];
const dayFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
const monthDay = dayFormat({ month: 'short', day: 'numeric' });

const isLastDayOfMonth = (key: string) => {
  const date = toDate(key);
  return (
    new Date(date.getTime() + 86400000).getUTCMonth() !== date.getUTCMonth()
  );
};

const nthOf = (key: string): Nth => {
  const nth = Math.ceil(toDate(key).getUTCDate() / 7);
  return nth > 4 ? -1 : (nth as Nth);
};

const addMonths = (key: string, months: number) => {
  const date = toDate(key);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toKey(date);
};

const ordinalDay = (day: number) => {
  const mod = day % 100;
  if (mod >= 11 && mod <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
};

const toParts = (rule: RepeatRule | null, startsOn: string): RepeatParts => {
  if (!rule) {
    return {
      freq: 'weekly',
      interval: 1,
      weekdays: [weekdayOf(startsOn).key],
      monthBy: 'day',
      nth: nthOf(startsOn),
      endsKind: 'never',
      until: null,
      count: null,
    };
  }
  const monthBy: MonthBy | null =
    rule.freq !== 'monthly'
      ? 'day'
      : rule.monthBy === 'nthWeekday'
        ? 'nthWeekday'
        : rule.monthDay === -1
          ? 'lastDay'
          : 'day';
  return {
    freq: rule.freq,
    interval: rule.interval,
    weekdays:
      rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(startsOn).key],
    monthBy,
    nth: rule.nth ?? nthOf(startsOn),
    endsKind: rule.until ? 'on' : rule.count ? 'after' : 'never',
    until: rule.until,
    count: rule.count,
  };
};

const sameRule = (a: RepeatRule | null, b: RepeatRule | null) =>
  (a && formatRepeatRule(a)) === (b && formatRepeatRule(b));

interface RadioRowProps {
  label: string;
  detail?: string | null;
  isChecked: boolean;
  onPick: () => void;
  hasChevron?: boolean;
  height?: string;
  children?: ReactNode;
}

function RadioRow({
  label,
  detail = null,
  isChecked,
  onPick,
  hasChevron = false,
  height = 'min-h-[52px]',
  children,
}: RadioRowProps) {
  return (
    <div className={join('flex items-center gap-2 pr-3', height)}>
      <Button
        type='button'
        variant='tertiary'
        role='radio'
        aria-checked={isChecked}
        onClick={onPick}
        className='text-foreground! h-auto min-h-[52px] min-w-0 flex-1 justify-start gap-3 py-2! pr-0! pl-3! text-left font-normal whitespace-normal'
      >
        <span
          aria-hidden='true'
          className={join(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            isChecked ? 'border-primary' : 'border-border',
          )}
        >
          {isChecked && <span className='bg-primary size-2.5 rounded-full' />}
        </span>
        <span className='min-w-0'>
          <span className='block text-[15px] font-medium'>{label}</span>
          {detail && (
            <span className='text-muted-foreground block text-[13px]'>
              {detail}
            </span>
          )}
        </span>
      </Button>
      {children}
      {hasChevron && (
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      )}
    </div>
  );
}

const Card = ({ children, role }: { children: ReactNode; role?: string }) => (
  <div
    role={role}
    className='bg-card border-border divide-border divide-y overflow-hidden rounded-xl border'
  >
    {children}
  </div>
);

export interface PickerShared {
  startsOn: string;
  time: string | null;
  value: RepeatRule | null;
  onChange: (rule: RepeatRule | null) => void;
  weekStart: Weekday;
  timeFormat?: (time: string) => string;
}

interface PresetsViewProps extends PickerShared {
  backLabel: string;
  onBack: () => void;
  onCustom: () => void;
}

export function PresetsView({
  startsOn,
  value,
  onChange,
  weekStart,
  backLabel,
  onBack,
  onCustom,
}: PresetsViewProps) {
  const presets = repeatPresets(startsOn, weekStart);
  const matched = presets.find((preset) => sameRule(preset.rule, value));
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pick = (key: string, rule: RepeatRule | null) => {
    setPickedKey(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      onChange(rule);
      onBack();
    }, PICK_FILL_MS);
  };
  const isChecked = (key: string) =>
    pickedKey !== null ? pickedKey === key : matched?.key === key;
  const customKey = 'current-custom';

  return (
    <div className='flex flex-col gap-4 pb-4'>
      <BackLink onBack={onBack} label={backLabel} />
      <h3 className={HEADING_CLASS}>How often</h3>
      <Card role='radiogroup'>
        {value && !matched && (
          <RadioRow
            label={describeRepeat(value, startsOn)}
            isChecked={isChecked(customKey)}
            onPick={() => pick(customKey, value)}
          />
        )}
        {presets.map((preset) => (
          <RadioRow
            key={preset.key}
            label={preset.label}
            detail={preset.detail}
            isChecked={isChecked(preset.key)}
            onPick={() => pick(preset.key, preset.rule)}
          />
        ))}
      </Card>
      <Card>
        <Button
          type='button'
          variant='tertiary'
          onClick={onCustom}
          className='text-foreground! h-auto min-h-[52px] w-full justify-between rounded-none px-3! text-[15px] font-medium'
        >
          <span>Custom…</span>
          <ChevronRight
            className='text-muted-foreground size-4'
            aria-hidden='true'
          />
        </Button>
      </Card>
    </div>
  );
}

interface CustomViewProps extends PickerShared {
  onBack: () => void;
  onDone: () => void;
}

export function CustomView({
  startsOn,
  time,
  value,
  onChange,
  weekStart,
  timeFormat,
  onBack,
  onDone,
}: CustomViewProps) {
  const [initial] = useState(() => toParts(value, startsOn));
  const [parts, setParts] = useState<RepeatParts>(initial);
  const freq = parts.freq ?? 'weekly';
  const rule = repeatFromParts({ ...parts, freq }, startsOn, weekStart);
  const isDirty = JSON.stringify(parts) !== JSON.stringify(initial);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onBack,
    title: 'Discard your changes?',
    message: 'Your changes to this repeat will not be saved.',
  });
  const patch = (next: Partial<RepeatParts>) =>
    setParts((current) => ({ ...current, ...next }));
  const startDay = weekdayOf(startsOn);
  const startDate = toDate(startsOn).getUTCDate();
  const nth = nthOf(startsOn);
  const isSingular = parts.interval === 1;
  const cap = REPEAT_CAPS[freq];
  const order = [
    ...WEEKDAYS.slice(WEEKDAYS.findIndex(({ key }) => key === weekStart)),
    ...WEEKDAYS.slice(
      0,
      WEEKDAYS.findIndex(({ key }) => key === weekStart),
    ),
  ];
  const isUntilValid = parts.until !== null && parts.until >= startsOn;
  const canFinish = parts.endsKind !== 'on' || isUntilValid;

  const changeFreq = (next: RepeatFreq) =>
    patch({
      freq: next,
      interval: Math.min(parts.interval, REPEAT_CAPS[next]),
      weekdays: parts.weekdays.length > 0 ? parts.weekdays : [startDay.key],
      monthBy: parts.monthBy ?? 'day',
    });

  const toggleDay = (key: Weekday) => {
    const isPicked = parts.weekdays.includes(key);
    if (isPicked && parts.weekdays.length === 1) return;
    patch({
      weekdays: isPicked
        ? parts.weekdays.filter((day) => day !== key)
        : [...parts.weekdays, key],
    });
  };

  const monthDetail = (by: MonthBy) =>
    listOccurrences(
      repeatFromParts(
        {
          ...parts,
          freq: 'monthly',
          interval: 1,
          monthBy: by,
          nth,
          endsKind: 'never',
        },
        startsOn,
        weekStart,
      ),
      startsOn,
      { limit: 3 },
    )
      .map((key) => monthDay.format(toDate(key)))
      .join(', ');

  const monthRows: { by: MonthBy; label: string; detail: string | null }[] = [
    {
      by: 'day',
      label: `On day ${startDate}`,
      detail:
        startDate > 28
          ? `Months without a ${ordinalDay(startDate)} are skipped`
          : null,
    },
    {
      by: 'nthWeekday',
      label: `On the ${ORDINALS[nth]} ${startDay.name}`,
      detail: monthDetail('nthWeekday'),
    },
    ...(isLastDayOfMonth(startsOn)
      ? [
          {
            by: 'lastDay' as const,
            label: 'On the last day',
            detail: monthDetail('lastDay'),
          },
        ]
      : []),
  ];

  return (
    <div className='flex flex-col gap-5 pb-4'>
      <BackLink onBack={requestClose} label='How often' />
      <h3 className={HEADING_CLASS}>Custom repeat</h3>

      <div className='flex flex-col gap-2'>
        <p className={LABEL_CLASS}>Repeat every</p>
        <Stepper
          label='Repeat every'
          value={parts.interval}
          min={1}
          max={cap}
          step={1}
          onChange={(interval) => patch({ interval })}
        />
        <SegmentedControl
          label='Repeat unit'
          value={freq}
          onChange={changeFreq}
          options={FREQS.map((key) => ({
            value: key,
            label: UNIT_WORDS[key][isSingular ? 0 : 1],
          }))}
        />
      </div>

      {freq === 'weekly' && (
        <div className='flex flex-col gap-2'>
          <p className={LABEL_CLASS}>On</p>
          <div className='grid grid-cols-7 gap-1'>
            {order.map(({ key, name, letter }) => {
              const isPicked = parts.weekdays.includes(key);
              return (
                <Button
                  key={key}
                  type='button'
                  variant={isPicked ? 'primary' : 'tertiary'}
                  rounded='full'
                  aria-label={name}
                  aria-pressed={isPicked}
                  onClick={() => toggleDay(key)}
                  className={join(
                    "relative mx-auto aspect-square size-9 min-w-0 p-0 before:absolute before:-inset-1 before:content-[''] min-[360px]:size-10",
                    !isPicked &&
                      'border-border bg-card text-foreground! border',
                  )}
                >
                  {letter}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {freq === 'monthly' && (
        <div className='flex flex-col gap-2'>
          <p className={LABEL_CLASS}>On</p>
          <Card role='radiogroup'>
            {monthRows.map(({ by, label, detail }) => (
              <RadioRow
                key={by}
                label={label}
                detail={detail}
                isChecked={parts.monthBy === by}
                onPick={() => patch({ monthBy: by, nth })}
              />
            ))}
          </Card>
        </div>
      )}

      {freq === 'yearly' && (
        <div className='flex flex-col gap-2'>
          <p className={LABEL_CLASS}>On</p>
          <p className='text-[15px]'>{monthDay.format(toDate(startsOn))}</p>
        </div>
      )}

      <div className='flex flex-col gap-2'>
        <p className={LABEL_CLASS}>Ends</p>
        <Card role='radiogroup'>
          <RadioRow
            label='Never'
            isChecked={parts.endsKind === 'never'}
            onPick={() => patch({ endsKind: 'never' })}
          />
          <RadioRow
            label='On'
            isChecked={parts.endsKind === 'on'}
            onPick={() =>
              patch({
                endsKind: 'on',
                until: parts.until ?? addMonths(startsOn, 3),
              })
            }
          >
            <DateInput
              aria-label='Ends on'
              value={parts.until ?? ''}
              min={startsOn}
              wrapperClassName='w-40 shrink-0'
              onChange={(event) =>
                patch({ endsKind: 'on', until: event.target.value || null })
              }
            />
          </RadioRow>
          <RadioRow
            label='After'
            isChecked={parts.endsKind === 'after'}
            onPick={() =>
              patch({ endsKind: 'after', count: parts.count ?? 10 })
            }
          >
            <Stepper
              isCompact
              label='Times'
              value={parts.count ?? 10}
              min={1}
              max={REPEAT_CAPS.count}
              step={1}
              onChange={(count) => patch({ endsKind: 'after', count })}
            />
            <span className='text-[15px]'>times</span>
          </RadioRow>
        </Card>
      </div>

      <RepeatSummary
        rule={rule}
        startsOn={startsOn}
        time={time}
        timeFormat={timeFormat}
      />
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={requestClose}>
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            variant='primary'
            disabled={!canFinish}
            onClick={() => {
              onChange(rule);
              onDone();
            }}
          >
            Done
          </Button>
        }
      />
    </div>
  );
}
