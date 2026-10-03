import { Input } from '@moondreamsdev/dreamer-ui/components';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  errorMessage?: string;
  ariaLabel?: string;
}

/** A dollar amount typed as text: a number input's spinner and float parsing are wrong for money. */
function MoneyInput({
  value,
  onChange,
  placeholder,
  disabled,
  errorMessage,
  ariaLabel,
}: MoneyInputProps) {
  return (
    <div className='relative'>
      <span className='text-muted-foreground pointer-events-none absolute top-2 left-3 text-sm'>
        $
      </span>
      <Input
        type='text'
        inputMode='decimal'
        variant='outline'
        autoComplete='off'
        className='pl-6'
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        errorMessage={errorMessage}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default MoneyInput;
