import {
  RadioGroup,
  RadioGroupItem,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface RadioRow<Value extends string> {
  value: Value;
  label: string;
  subtitle?: string;
}

interface RadioRowsProps<Value extends string> {
  rows: readonly RadioRow<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}

/** One choice of a few as radio rows, each with a line saying what it does. */
function RadioRows<Value extends string>({
  rows,
  value,
  onChange,
}: RadioRowsProps<Value>) {
  return (
    <RadioGroup
      value={value}
      onChange={(next) => onChange(next as Value)}
      className='grid gap-2'
    >
      {rows.map((row) => (
        <RadioGroupItem
          key={row.value}
          value={row.value}
          hideInput
          className={join(
            'has-[:focus-visible]:ring-primary rounded-xl !border px-3 py-2.5 text-left transition-none focus-within:!border-solid has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2',
            value === row.value
              ? '!border-primary bg-primary/5'
              : 'bg-card !border-border',
          )}
        >
          <span className='flex flex-col items-start gap-0.5'>
            <span className='text-sm font-medium'>{row.label}</span>
            {row.subtitle && (
              <span className='text-muted-foreground text-[13px] text-pretty'>
                {row.subtitle}
              </span>
            )}
          </span>
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}

export default RadioRows;
