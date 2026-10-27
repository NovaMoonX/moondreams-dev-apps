import { useRef } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import {
  cleanAmountText,
  isAmountText,
  useAmountTyping,
} from '@/hooks/useAmountTyping';
import { toTwoDecimalAmount } from '@/utils/moneyUtils';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  errorMessage?: string;
  ariaLabel?: string;
  className?: string;
  /** Sizes the whole field (its border and $) where a row places it. */
  wrapperClassName?: string;
  autoFocus?: boolean;
  /** `outline` leaves the fill clear so it matches an outline `Input` beside it in a modal or drawer. */
  variant?: 'solid' | 'outline';
  /** Off unless the amount can be below zero. */
  allowNegative?: boolean;
}

/** A dollar amount typed as text: a number input's spinner and float parsing are wrong for money. It settles to two decimals when the field loses focus or Enter is pressed. */
function MoneyInput({
  value,
  onChange,
  placeholder,
  disabled,
  errorMessage,
  ariaLabel,
  className,
  wrapperClassName,
  autoFocus,
  variant = 'solid',
  allowNegative = false,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useAmountTyping(inputRef, { allowNegative });
  const settle = () => {
    const settled = toTwoDecimalAmount(value);
    if (settled !== value) {
      onChange(settled);
    }
  };

  return (
    <div className={join('space-y-1', wrapperClassName)}>
      <div
        className={join(
          'border-border flex items-center rounded-full border pl-4 focus-within:border-current/60',
          variant === 'solid' ? 'bg-background' : 'bg-transparent',
          errorMessage && 'border-destructive!',
          disabled && 'opacity-60',
        )}
      >
        <span className='text-muted-foreground' aria-hidden='true'>
          $
        </span>
        <Input
          ref={inputRef}
          type='text'
          inputMode='decimal'
          variant='base'
          autoComplete='off'
          className={join(
            'min-w-0 flex-1 border-0! bg-transparent pl-2! focus:border-0!',
            className,
          )}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-invalid={errorMessage ? true : undefined}
          onChange={(event) => {
            const typed = event.target.value;
            onChange(
              isAmountText(typed, { allowNegative })
                ? typed
                : (cleanAmountText(typed, { allowNegative }) ?? value),
            );
          }}
          onBlur={settle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              settle();
            }
          }}
        />
      </div>
      {errorMessage && (
        <p className='text-destructive px-3 text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default MoneyInput;
