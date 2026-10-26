import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';

import SummaryRow from '@/components/SummaryRow';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { formatDateUTC } from '@/utils/formatUtils';

interface FoldedDateFieldProps {
  label: string;
  /** A date input's text ("2026-10-26"), a date-only value. */
  value: string;
  onChange: (value: string) => void;
  /** Today as a date input's text, which the folded row calls "Today". */
  todayValue: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}

/** A day that is nearly always today: one folded row ("Day · Today ›") that opens to a date field in place when tapped. */
function FoldedDateField({
  label,
  value,
  onChange,
  todayValue,
  min,
  max,
  disabled,
}: FoldedDateFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    const date = fromDateInputValue(value);
    const shown =
      value === todayValue
        ? 'Today'
        : date === undefined
          ? 'Pick a day'
          : formatDateUTC(date);
    return (
      <SummaryRow
        label={label}
        ariaLabel={`${label}: ${shown}. Change`}
        onClick={disabled ? undefined : () => setIsOpen(true)}
      >
        {shown}
      </SummaryRow>
    );
  }

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <Input
        type='date'
        variant='outline'
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default FoldedDateField;
