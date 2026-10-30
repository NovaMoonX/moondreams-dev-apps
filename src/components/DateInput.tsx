import { Input, type InputProps } from '@moondreamsdev/dreamer-ui/components';

import { join } from '@moondreamsdev/dreamer-ui/utils';

type DateInputProps = Omit<InputProps, 'type'>;

const FORMAT_PARTS: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {
  year: 'yyyy',
  month: 'mm',
  day: 'dd',
};

const toLocaleFormat = () =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date(2000, 10, 22))
    .map(({ type, value }) => FORMAT_PARTS[type] ?? value)
    .join('');

/** A native date input that always shows a placeholder while empty (the format, or `placeholder`), since phones draw an empty date box blank. */
function DateInput({ className, placeholder, ...rest }: DateInputProps) {
  return (
    <div className='relative w-full min-w-0'>
      <Input {...rest} type='date' className={join('peer', className)} />
      <span
        aria-hidden
        className='text-muted-foreground/70 pointer-events-none absolute inset-y-0 left-2 hidden items-center truncate text-base peer-not-focus:peer-data-[empty]:flex'
      >
        {placeholder ?? toLocaleFormat()}
      </span>
    </div>
  );
}

export default DateInput;
