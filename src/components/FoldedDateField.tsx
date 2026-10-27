import { Input } from '@moondreamsdev/dreamer-ui/components';

import SummaryEditor from '@/components/SummaryEditor';
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

/** A day that is nearly always today: one folded row ("Day · Today ›") whose date field opens in its own editor (a drawer on a phone, a popover from `sm`), so no row moves. */
function FoldedDateField({
  label,
  value,
  onChange,
  todayValue,
  min,
  max,
  disabled,
}: FoldedDateFieldProps) {
  const date = fromDateInputValue(value);
  const shown =
    value === todayValue
      ? 'Today'
      : date === undefined
        ? 'Pick a day'
        : formatDateUTC(date);

  return (
    <SummaryEditor
      label={label}
      summary={shown}
      placeholder='Pick a day'
      title={label}
      isFramed
      shouldFocus={false}
    >
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
    </SummaryEditor>
  );
}

export default FoldedDateField;
