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
    <div className='relative'>
      <span className='text-muted-foreground pointer-events-none absolute top-5 left-4 -translate-y-1/2 text-sm'>
        $
      </span>
      <Input
        type='text'
        inputMode='decimal'
        variant='outline'
        rounded='full'
        autoComplete='off'
        className={join('pl-8!', className)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        errorMessage={errorMessage}
        onChange={(event) => onChange(event.target.value)}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            settle();
          }
        }}
      />
    </div>
  );
}

export default MoneyInput;
