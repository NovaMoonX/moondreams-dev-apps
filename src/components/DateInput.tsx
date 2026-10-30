import { Input, type InputProps } from '@moondreamsdev/dreamer-ui/components';

import { join } from '@moondreamsdev/dreamer-ui/utils';

type DateInputProps = Omit<InputProps, 'type'> & {
  /** Sizes the field (`w-44`, `flex-1`, `shrink-0`); the wrapper is `w-full` otherwise. */
  wrapperClassName?: string;
};

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

/** Where the browser starts the date text: the input's `px-2` (`px-3` when fully rounded) plus a 1px border on the variants that have one. */
const getOverlayLeft = (
  variant: DateInputProps['variant'],
  rounded: DateInputProps['rounded'],
) =>
  join(
    rounded === 'full' ? 'left-3' : 'left-2',
    (variant === undefined ||
      variant === 'outline' ||
      variant === 'transparent') &&
      'ml-px',
  );

/** A native date input that always shows a placeholder while empty (the format, or `placeholder`), since phones draw an empty date box blank. `className` styles the input, `wrapperClassName` sizes the field. */
function DateInput({
  className,
  wrapperClassName,
  placeholder,
  errorMessage,
  variant,
  rounded,
  value,
  disabled,
  ...rest
}: DateInputProps) {
  const hasValue = typeof value === 'string' && value !== '';
  return (
    <div className={join('w-full min-w-0', wrapperClassName)}>
      <div className='relative'>
        <Input
          {...rest}
          value={value}
          disabled={disabled}
          variant={variant}
          rounded={rounded}
          type='date'
          aria-invalid={errorMessage ? true : rest['aria-invalid']}
          className={join(
            'peer',
            errorMessage && 'border-destructive',
            className,
          )}
        />
        {!hasValue && (
          <span
            aria-hidden
            className={join(
              'text-muted-foreground/70 pointer-events-none absolute inset-y-0 hidden items-center truncate text-base peer-not-focus:peer-data-[empty]:flex',
              getOverlayLeft(variant, rounded),
              disabled && 'opacity-50',
            )}
          >
            {placeholder ?? toLocaleFormat()}
          </span>
        )}
      </div>
      {errorMessage && (
        <p className='text-destructive mt-1 text-sm' role='alert'>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default DateInput;
