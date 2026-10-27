import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import RevealChip from '@/components/RevealChip';
import { runWhenDrawerSettled } from '@/hooks/useKeepFocusedFieldInView';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { toTwoDecimalAmount } from '@/utils/moneyUtils';

const PHONE_FOCUS_DELAY_MS = 500;
const MAX_WAYS_SHOWN = 2;

/** Another way to give the amount (a range, a share of something), offered as a chip under the figure. */
export interface AmountHeroWay {
  label: string;
  onClick: () => void;
}

interface AmountHeroProps {
  /** The small caption over the figure, also its accessible name ("Amount"). */
  label: string;
  /** Dollars as typed; the low end when it is a range. */
  value: string;
  onChange: (value: string) => void;
  /** Takes focus once its sheet has settled, on a phone only, where the keyboard is the next thing anyway. */
  autoFocus?: boolean;
  /** Takes focus as it appears, at any size: it was just revealed by a tap. */
  focusOnOpen?: boolean;
  isRange?: boolean;
  highValue?: string;
  onHighChange?: (value: string) => void;
  /** Offers the switch between one amount and a range; it is left out when this is missing. */
  onRangeToggle?: () => void;
  /** What the range switch says in each state. */
  rangeToggleLabels?: { toRange: string; toExact: string };
  rangeLabels?: { low: string; high: string };
  /** Other ways to give the amount, as chips after the range switch; past two, all but the first wait behind "More ways". */
  ways?: AmountHeroWay[];
  /** One quiet line right under the figure (how often, what it is for). */
  suffix?: ReactNode;
  /** One short line under the links. */
  hint?: ReactNode;
  errorMessage?: string;
  disabled?: boolean;
}

/** The figure's type size: as large as fits, stepping down as the amount grows so the widest real value stays on one line at 320px. */
const getSizeClass = (length: number, isRange: boolean) => {
  if (isRange) {
    if (length <= 5) return 'text-4xl';
    if (length <= 8) return 'text-3xl';
    return 'text-2xl';
  }
  if (length <= 8) return 'text-5xl';
  if (length <= 10) return 'text-4xl';
  return 'text-3xl';
};

/** "12345.67" as money reads, "12,345.67"; anything that isn't plain digits is left as typed. */
// Focus given from code selects the figure, so typing replaces it as a tap or Tab would.
const focusWhole = (field: HTMLInputElement | null) => {
  field?.focus({ preventScroll: true });
  field?.select();
};

const groupDigits = (value: string) => {
  const match = /^(\d+)(\.\d*)?$/.exec(value);
  if (!match) return value;
  const result = `${match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[2] ?? ''}`;
  return result;
};

interface FigureProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  sizeClass: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isInvalid: boolean;
  disabled?: boolean;
}

function Figure({
  ariaLabel,
  value,
  onChange,
  sizeClass,
  inputRef,
  isInvalid,
  disabled,
}: FigureProps) {
  const pendingCaret = useRef<number | null>(null);
  const shown = groupDigits(value);
  const settle = () => {
    const settled = toTwoDecimalAmount(value);
    if (settled !== value) onChange(settled);
  };
  const applyCaret = () => {
    const field = inputRef.current;
    const significant = pendingCaret.current;
    if (significant === null || !field) return;
    pendingCaret.current = null;
    if (document.activeElement !== field) return;
    const seen = { count: 0 };
    const position = Array.from(field.value).findIndex((char) => {
      if (seen.count === significant) return true;
      if (char !== ',') seen.count += 1;
      return false;
    });
    const caret = position === -1 ? field.value.length : position;
    field.setSelectionRange(caret, caret);
  };

  useLayoutEffect(applyCaret);

  return (
    <label
      className={join(
        'inline-flex max-w-full cursor-text items-start border-b-2 border-transparent px-1 font-semibold tracking-tight tabular-nums',
        'has-[input:focus]:border-primary/50',
        sizeClass,
      )}
    >
      <span
        className='text-muted-foreground mt-[0.18em] mr-0.5 text-[0.5em] leading-none'
        aria-hidden='true'
      >
        $
      </span>
      <span className='relative inline-block min-w-[1.5ch] leading-tight'>
        <span
          className='invisible block px-0.5 whitespace-pre'
          aria-hidden='true'
        >
          {shown === '' ? '0' : shown}
        </span>
        <Input
          ref={inputRef}
          type='text'
          inputMode='decimal'
          variant='base'
          autoComplete='off'
          size={1}
          aria-label={ariaLabel}
          aria-invalid={isInvalid ? true : undefined}
          placeholder='0'
          value={shown}
          disabled={disabled}
          className={join(
            'absolute inset-0 h-full! w-full min-w-0 rounded-lg border-0! bg-transparent! px-0.5! py-0! text-center font-semibold tracking-tight tabular-nums',
            sizeClass,
            'placeholder:text-muted-foreground/50',
          )}
          onChange={(event) => {
            const field = event.target;
            const caret = field.selectionStart ?? field.value.length;
            const countBefore = (text: string, end: number) =>
              text.slice(0, end).replace(/,/g, '').length;
            const typed = field.value.replace(/,/g, '');
            const isCommaDeleted =
              typed === value && field.value.length < shown.length;
            const significant = countBefore(field.value, caret);
            pendingCaret.current = isCommaDeleted
              ? Math.max(0, significant - 1)
              : significant;
            onChange(
              isCommaDeleted
                ? value.slice(0, significant - 1) + value.slice(significant)
                : typed,
            );
            window.requestAnimationFrame(applyCaret);
          }}
          onBlur={settle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              settle();
            }
          }}
        />
      </span>
    </label>
  );
}

/** A quiet text line under the figure that opens something else (how often it repeats). */
export function AmountHeroLink({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label={ariaLabel}
      className='text-muted-foreground! hover:text-foreground! h-10 px-2! text-sm font-normal'
      onClick={onClick}
    >
      <span className='underline decoration-current/40 underline-offset-4'>
        {children}
      </span>
    </Button>
  );
}

/** A money entry as the screen's largest figure, centred, with a smaller dollar sign; a range is two halves of the same figure. */
function AmountHero({
  label,
  value,
  onChange,
  autoFocus = false,
  focusOnOpen = false,
  isRange = false,
  highValue = '',
  onHighChange,
  onRangeToggle,
  rangeToggleLabels = { toRange: 'It varies', toExact: 'One amount' },
  rangeLabels = { low: 'lowest', high: 'highest' },
  ways = [],
  suffix,
  hint,
  errorMessage,
  disabled,
}: AmountHeroProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [isShowingAllWays, setIsShowingAllWays] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const highRef = useRef<HTMLInputElement>(null);
  const shouldFocus = autoFocus && isPhone;
  const [isFocusingOnOpen] = useState(focusOnOpen);

  useEffect(() => {
    if (isFocusingOnOpen) focusWhole(inputRef.current);
  }, [isFocusingOnOpen]);

  const [focusRequest, setFocusRequest] = useState<{
    end: 'low' | 'high';
  } | null>(null);
  useEffect(() => {
    if (focusRequest === null) return;
    focusWhole((focusRequest.end === 'high' ? highRef : inputRef).current);
  }, [focusRequest]);

  useEffect(() => {
    if (!shouldFocus) return;
    return runWhenDrawerSettled(
      inputRef.current,
      () => focusWhole(inputRef.current),
      PHONE_FOCUS_DELAY_MS,
    );
  }, [shouldFocus]);

  const digitsOf = (text: string) => text.replace(/,/g, '').length;
  const longest = Math.max(digitsOf(value), isRange ? digitsOf(highValue) : 0);
  const sizeClass = getSizeClass(longest, isRange);
  const allWays: AmountHeroWay[] = [
    ...(onRangeToggle
      ? [
          {
            label: isRange
              ? rangeToggleLabels.toExact
              : rangeToggleLabels.toRange,
            onClick: () => {
              onRangeToggle();
              setFocusRequest({ end: isRange ? 'low' : 'high' });
            },
          },
        ]
      : []),
    ...ways,
  ];
  const isFolded = allWays.length > MAX_WAYS_SHOWN && !isShowingAllWays;
  const shownWays = isFolded ? allWays.slice(0, 1) : allWays;

  return (
    <div className='flex flex-col items-center gap-1 text-center'>
      <p className='text-muted-foreground text-sm'>{label}</p>
      <div className='flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1'>
        <Figure
          ariaLabel={isRange ? `${label}, ${rangeLabels.low}` : label}
          value={value}
          onChange={onChange}
          sizeClass={sizeClass}
          inputRef={inputRef}
          isInvalid={Boolean(errorMessage)}
          disabled={disabled}
        />
        {isRange && (
          <span className='inline-flex max-w-full items-center gap-x-3 whitespace-nowrap'>
            <span className='text-muted-foreground text-lg'>to</span>
            <Figure
              ariaLabel={`${label}, ${rangeLabels.high}`}
              value={highValue}
              onChange={(next) => onHighChange?.(next)}
              sizeClass={sizeClass}
              inputRef={highRef}
              isInvalid={Boolean(errorMessage)}
              disabled={disabled}
            />
          </span>
        )}
      </div>
      {suffix && <div className='text-sm'>{suffix}</div>}
      {errorMessage && (
        <p className='text-destructive text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
      {allWays.length > 0 && (
        <div className='flex flex-wrap items-center justify-center gap-2 pt-1'>
          {shownWays.map((way) => (
            <RevealChip key={way.label} onClick={way.onClick}>
              {way.label}
            </RevealChip>
          ))}
          {isFolded && (
            <RevealChip onClick={() => setIsShowingAllWays(true)}>
              More ways
            </RevealChip>
          )}
        </div>
      )}
      {hint && (
        <div className='text-muted-foreground max-w-xs text-xs'>{hint}</div>
      )}
    </div>
  );
}

export default AmountHero;
