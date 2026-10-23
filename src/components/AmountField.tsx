import MoneyInput from '@/components/MoneyInput';

interface AmountFieldProps {
  /** What the money is called here ("Take-home pay"). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** An exact amount is the only mode so far. */
  mode?: 'exact';
  hint?: string;
  errorMessage?: string;
  placeholder?: string;
}

/** A labelled amount of money. */
function AmountField({
  label,
  value,
  onChange,
  hint,
  errorMessage,
  placeholder = '0.00',
}: AmountFieldProps) {
  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <MoneyInput
        variant='outline'
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={label}
        errorMessage={errorMessage}
      />
      {hint && <p className='text-muted-foreground px-1 text-xs'>{hint}</p>}
    </div>
  );
}

export default AmountField;
