import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, Ref } from 'react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export type CheckboxTone = 'primary' | 'success' | 'warning' | 'destructive';

type AppCheckboxProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'role' | 'children' | 'onChange'
> & {
  ref?: Ref<HTMLButtonElement>;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  tone?: CheckboxTone;
  isMark?: boolean;
};

const TONE_STYLE: Record<CheckboxTone, CSSProperties | undefined> = {
  primary: undefined,
  success: {
    '--checkbox-accent': 'var(--color-success)',
    '--checkbox-accent-foreground': 'var(--color-success-foreground)',
  } as CSSProperties,
  warning: {
    '--checkbox-accent': 'var(--color-warning)',
    '--checkbox-accent-foreground': 'var(--color-warning-foreground)',
  } as CSSProperties,
  destructive: {
    '--checkbox-accent': 'var(--color-destructive)',
    '--checkbox-accent-foreground': 'var(--color-destructive-foreground)',
  } as CSSProperties,
};

/** The site's checkbox: its shape, weight and fill come from the app theme's `--checkbox-*` tokens, with a 40px target. */
function AppCheckbox({
  ref,
  checked,
  indeterminate = false,
  onCheckedChange,
  tone = 'primary',
  isMark = false,
  className,
  style,
  onClick,
  ...rest
}: AppCheckboxProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onCheckedChange?.(indeterminate ? true : !checked);
  };

  return (
    <button
      ref={ref}
      type='button'
      role='checkbox'
      aria-checked={indeterminate ? 'mixed' : checked}
      data-variant={isMark ? 'mark' : undefined}
      className={join('app-checkbox', className)}
      style={{ ...TONE_STYLE[tone], ...style }}
      onClick={handleClick}
      {...rest}
    >
      <svg viewBox='0 0 24 24' fill='none' aria-hidden='true'>
        <path d={indeterminate ? 'M7 12h10' : 'M6 12.5l4 4L18 8'} />
      </svg>
    </button>
  );
}

export default AppCheckbox;
