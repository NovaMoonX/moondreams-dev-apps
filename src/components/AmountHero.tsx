import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { toTwoDecimalAmount } from '@/utils/moneyUtils';

const PHONE_FOCUS_DELAY_MS = 350;

interface AmountHeroProps {
  /** The small caption over the figure, also its accessible name ("Amount", "Take-home pay"). */
  label: string;
  /** Dollars as typed; the low end when it is a range. */
  value: string;
  onChange: (value: string) => void;
  /** Takes focus once its sheet has settled, on a phone only, where the keyboard is the next thing anyway. */
  autoFocus?: boolean;
  isRange?: boolean;
  highValue?: string;
  onHighChange?: (value: string) => void;
  /** Offers the switch between one amount and a range; it is left out when this is missing. */
  onRangeToggle?: () => void;
  /** What the range switch says in each state. */
  rangeToggleLabels?: { toRange: string; toExact: string };
  rangeLabels?: { low: string; high: string };
  /** More quiet links beside the range switch, built with `AmountHeroLink`. */
  links?: ReactNode;
  /** One quiet line right under the figure ("every income day ›"). */
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
  inputRef?: Ref<HTMLInputElement>;
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
  const [isTyping, setIsTyping] = useState(false);
  const shown = isTyping ? value : groupDigits(value);
  const settle = () => {
    const settled = toTwoDecimalAmount(value);
    if (settled !== value) onChange(settled);
  };

  return (
    <label
      className={join(
        'inline-flex max-w-full cursor-text items-start font-semibold tracking-tight tabular-nums',
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
            if (isTyping) {
              onChange(event.target.value);
              return;
            }
            setIsTyping(true);
            onChange(event.target.value.replace(/,/g, ''));
          }}
          onFocus={(event) => {
            const field = event.currentTarget;
            setIsTyping(true);
            window.requestAnimationFrame(() => {
              const end = field.value.length;
              field.setSelectionRange(end, end);
            });
          }}
          onBlur={() => {
            setIsTyping(false);
            settle();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setIsTyping(false);
              settle();
            }
          }}
        />
      </span>
    </label>
  );
}

/** A quiet text action under the figure (a range, a percentage, whatever is left); never a pill row over the amount. */
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
  isRange = false,
  highValue = '',
  onHighChange,
  onRangeToggle,
  rangeToggleLabels = { toRange: 'It varies', toExact: 'One amount' },
  rangeLabels = { low: 'lowest', high: 'highest' },
  links,
  suffix,
  hint,
  errorMessage,
  disabled,
}: AmountHeroProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldFocus = autoFocus && isPhone;

  useEffect(() => {
    if (!shouldFocus) return;
    const timer = window.setTimeout(
      () => inputRef.current?.focus(),
      PHONE_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shouldFocus]);

  const digitsOf = (text: string) => text.replace(/,/g, '').length;
  const longest = Math.max(digitsOf(value), isRange ? digitsOf(highValue) : 0);
  const sizeClass = getSizeClass(longest, isRange);
  const hasLinks = Boolean(onRangeToggle) || Boolean(links);

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
          <>
            <span className='text-muted-foreground text-lg'>to</span>
            <Figure
              ariaLabel={`${label}, ${rangeLabels.high}`}
              value={highValue}
              onChange={(next) => onHighChange?.(next)}
              sizeClass={sizeClass}
              isInvalid={Boolean(errorMessage)}
              disabled={disabled}
            />
          </>
        )}
      </div>
      {suffix && <div className='text-sm'>{suffix}</div>}
      {errorMessage && (
        <p className='text-destructive text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
      {hasLinks && (
        <div className='flex flex-wrap items-center justify-center gap-x-2'>
          {onRangeToggle && (
            <AmountHeroLink onClick={onRangeToggle}>
              {isRange ? rangeToggleLabels.toExact : rangeToggleLabels.toRange}
            </AmountHeroLink>
          )}
          {links}
        </div>
      )}
      {hint && (
        <div className='text-muted-foreground max-w-xs text-xs'>{hint}</div>
      )}
    </div>
  );
}

export default AmountHero;
