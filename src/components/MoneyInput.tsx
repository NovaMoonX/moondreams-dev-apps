import { Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { toTwoDecimalAmount } from '@/utils/moneyUtils';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  errorMessage?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
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
  autoFocus,
}: MoneyInputProps) {
  const settle = () => {
    const settled = toTwoDecimalAmount(value);
    if (settled !== value) {
      onChange(settled);
    }
  };

  return (
    <div className='space-y-1'>
      <div
        className={join(
          'border-border bg-background flex items-center rounded-full border pl-4 focus-within:border-current/60',
          errorMessage && 'border-destructive!',
          disabled && 'opacity-60',
        )}
      >
        <span className='text-muted-foreground' aria-hidden='true'>
          $
        </span>
        <Input
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
          onChange={(event) => onChange(event.target.value)}
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
