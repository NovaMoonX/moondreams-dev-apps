import { Input } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@/components/MoneyInput';
import { PillGroup } from '@/components/PillGroup';

export type AmountMode = 'exact' | 'percent' | 'rest';

export interface AmountModeOption {
  value: AmountMode;
  label: string;
}

interface AmountFieldProps {
  /** What the amount is called here ("Take-home pay"). */
  label: string;
  /** Dollars in exact mode, whole or half percents ("12.5") in percent mode, unused in rest mode. */
  value: string;
  onChange: (value: string) => void;
  /** Exact unless the caller offers `modes`. */
  mode?: AmountMode;
  /** More than one option draws a pill row above the field. */
  modes?: readonly AmountModeOption[];
  onModeChange?: (mode: AmountMode) => void;
  /** What a percentage is of, in the caller's words ("of the day's money"). */
  percentOfLabel?: string;
  /** What taking the rest means, in the caller's words. */
  restHint?: string;
  hint?: string;
  errorMessage?: string;
  placeholder?: string;
}

/** A labelled amount: exact money, a whole or half percentage of something the caller names, or the rest. */
function AmountField({
  label,
  value,
  onChange,
  mode = 'exact',
  modes,
  onModeChange,
  percentOfLabel = '',
  restHint,
  hint,
  errorMessage,
  placeholder = '0.00',
}: AmountFieldProps) {
  const shownHint = mode === 'rest' ? (restHint ?? hint) : hint;

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      {modes && modes.length > 1 && onModeChange && (
        <PillGroup
          label={label}
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
      {mode === 'percent' && (
        <div className='flex items-center gap-2'>
          <div className='w-28 shrink-0'>
            <Input
              variant='outline'
              type='text'
              inputMode='decimal'
              autoComplete='off'
              aria-label={label}
              aria-invalid={errorMessage ? true : undefined}
              placeholder='10'
              maxLength={6}
              value={value}
              onChange={(event) => onChange(event.target.value)}
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
        <p className='text-muted-foreground px-1 text-xs'>{shownHint}</p>
      )}
    </div>
  );
}

export default AmountField;
