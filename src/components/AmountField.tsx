import {
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';

import AmountHero, { type AmountHeroWay } from '@/components/AmountHero';
import MoneyInput from '@/components/MoneyInput';
import {
  cleanAmountText,
  isAmountText,
  useAmountTyping,
} from '@/hooks/useAmountTyping';
import RevealChip from '@/components/RevealChip';
import { PillGroup } from '@/components/PillGroup';

export type AmountMode = 'exact' | 'range' | 'percent' | 'rest';

export interface AmountModeOption {
  value: AmountMode;
  label: string;
  /** Its words as a chip under a hero figure ("It varies"); the label when missing. */
  linkLabel?: string;
}

interface AmountFieldProps {
  /** What the amount is called here ("Amount"). */
  label: string;
  /** Dollars in exact mode (the low end in range mode), whole or half percents ("12.5") in percent mode, unused in rest mode. */
  value: string;
  onChange: (value: string) => void;
  /** The high end in range mode. */
  highValue?: string;
  onHighChange?: (value: string) => void;
  /** The captions over the two ends in range mode. */
  rangeLabels?: { low: string; high: string };
  /** Exact unless the caller offers `modes`. */
  mode?: AmountMode;
  /** More than one option draws a pill row above the field. */
  modes?: readonly AmountModeOption[];
  onModeChange?: (mode: AmountMode) => void;
  /** What a percentage is of, in the caller's words ("of the day's money"). */
  percentOfLabel?: string;
  /** What taking the rest means, in the caller's words. */
  restHint?: string;
  hint?: ReactNode;
  errorMessage?: string;
  placeholder?: string;
  /** Draws the amount as the screen's large centred figure, the other modes as chips under it. */
  isHero?: boolean;
  /** A hero figure takes focus once its sheet settles, on a phone. */
  autoFocus?: boolean;
  /** One quiet line under a hero figure. */
  suffix?: ReactNode;
  /** More chips under a hero figure, after the other modes. */
  extraWays?: AmountHeroWay[];
}

const MAX_PERCENT = 100;

function PercentInput({
  ref,
  value,
  onChange,
  ...rest
}: Omit<ComponentProps<typeof Input>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef =
    (ref as RefObject<HTMLInputElement | null> | undefined) ?? ownRef;
  useAmountTyping(inputRef, { max: MAX_PERCENT });
  return (
    <Input
      {...rest}
      ref={inputRef}
      value={value}
      onChange={(event) => {
        const typed = event.target.value;
        onChange(
          isAmountText(typed, { max: MAX_PERCENT })
            ? typed
            : (cleanAmountText(typed, { max: MAX_PERCENT }) ?? value),
        );
      }}
    />
  );
}

/** A labelled amount: exact money, a low and a high end, a whole or half percentage of something the caller names, or the rest. */
function AmountField({
  label,
  value,
  onChange,
  highValue = '',
  onHighChange,
  rangeLabels = { low: 'Lowest', high: 'Highest' },
  mode = 'exact',
  modes,
  onModeChange,
  percentOfLabel = '',
  restHint,
  hint,
  errorMessage,
  placeholder = '0.00',
  isHero = false,
  autoFocus,
  suffix,
  extraWays = [],
}: AmountFieldProps) {
  const shownHint = mode === 'rest' ? (restHint ?? hint) : hint;
  const [hasSwitched, setHasSwitched] = useState(false);
  const percentRef = useRef<HTMLInputElement>(null);

  if (isHero) {
    const options = modes ?? [];
    const linkOf = (value: AmountMode) =>
      options.find((option) => option.value === value);
    const hasRange = linkOf('range') !== undefined;
    const isMoney = mode === 'exact' || mode === 'range';
    const others = options.filter(
      (option) =>
        option.value !== mode &&
        !(isMoney && (option.value === 'exact' || option.value === 'range')),
    );
    const ways: AmountHeroWay[] = [
      ...(onModeChange
        ? others.map((option) => ({
            label: option.linkLabel ?? option.label,
            onClick: () => {
              setHasSwitched(true);
              onModeChange(option.value);
              if (option.value === 'percent')
                window.requestAnimationFrame(() => percentRef.current?.focus());
            },
          }))
        : []),
      ...extraWays,
    ];

    if (isMoney) {
      return (
        <AmountHero
          label={label}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          focusOnOpen={hasSwitched}
          isRange={mode === 'range'}
          highValue={highValue}
          onHighChange={onHighChange}
          onRangeToggle={
            hasRange && onModeChange
              ? () => onModeChange(mode === 'range' ? 'exact' : 'range')
              : undefined
          }
          rangeToggleLabels={{
            toRange: linkOf('range')?.linkLabel ?? 'It varies',
            toExact: linkOf('exact')?.linkLabel ?? 'One amount',
          }}
          rangeLabels={rangeLabels}
          ways={ways}
          suffix={suffix}
          hint={shownHint}
          errorMessage={errorMessage}
        />
      );
    }

    return (
      <div className='flex flex-col items-center gap-2 text-center'>
        <p className='text-muted-foreground text-sm'>{label}</p>
        {mode === 'percent' && (
          <div className='flex items-center justify-center gap-2'>
            <div className='w-28 shrink-0'>
              <PercentInput
                ref={percentRef}
                variant='outline'
                type='text'
                inputMode='decimal'
                autoComplete='off'
                aria-label={label}
                aria-invalid={errorMessage ? true : undefined}
                placeholder='10'
                maxLength={6}
                className='text-center text-2xl font-semibold tabular-nums'
                value={value}
                onChange={onChange}
              />
            </div>
            <p className='text-muted-foreground min-w-0 text-left text-sm break-words'>
              % {percentOfLabel}
            </p>
          </div>
        )}
        {suffix && <div className='text-sm'>{suffix}</div>}
        {errorMessage && (
          <p className='text-destructive text-sm' role='alert'>
            {errorMessage}
          </p>
        )}
        {shownHint && (
          <div className='text-muted-foreground max-w-xs text-sm'>
            {shownHint}
          </div>
        )}
        {ways.length > 0 && (
          <div className='flex flex-wrap items-center justify-center gap-2'>
            {ways.map((way) => (
              <RevealChip key={way.label} onClick={way.onClick}>
                {way.label}
              </RevealChip>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      {modes && modes.length > 1 && onModeChange && (
        <PillGroup
          label={`${label}, kind`}
          isThin
          options={modes}
          value={mode}
          onChange={onModeChange}
        />
      )}
      {mode === 'exact' && (
        <MoneyInput
          variant='outline'
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          ariaLabel={label}
          errorMessage={errorMessage}
        />
      )}
      {mode === 'range' && (
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1'>
            <p className='text-muted-foreground px-1 text-xs'>
              {rangeLabels.low}
            </p>
            <MoneyInput
              variant='outline'
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              ariaLabel={`${label}, ${rangeLabels.low}`}
            />
          </div>
          <div className='space-y-1'>
            <p className='text-muted-foreground px-1 text-xs'>
              {rangeLabels.high}
            </p>
            <MoneyInput
              variant='outline'
              value={highValue}
              onChange={(next) => onHighChange?.(next)}
              placeholder={placeholder}
              ariaLabel={`${label}, ${rangeLabels.high}`}
            />
          </div>
        </div>
      )}
      {mode === 'range' && errorMessage && (
        <p className='text-destructive px-3 text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
      {mode === 'percent' && (
        <div className='flex items-center gap-2'>
          <div className='w-28 shrink-0'>
            <PercentInput
              variant='outline'
              type='text'
              inputMode='decimal'
              autoComplete='off'
              aria-label={label}
              aria-invalid={errorMessage ? true : undefined}
              placeholder='10'
              maxLength={6}
              value={value}
              onChange={onChange}
            />
          </div>
          <p className='text-muted-foreground min-w-0 text-sm break-words'>
            % {percentOfLabel}
          </p>
        </div>
      )}
      {mode === 'percent' && errorMessage && (
        <p className='text-destructive px-3 text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
      {shownHint && (
        <div className='text-muted-foreground px-1 text-xs'>{shownHint}</div>
      )}
    </div>
  );
}

export default AmountField;
