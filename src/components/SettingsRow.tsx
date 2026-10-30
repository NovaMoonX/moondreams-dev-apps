import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface SettingsRowProps {
  /** An emoji or icon for the round chip at the start. */
  icon: ReactNode;
  title: string;
  /** A quiet line or two under the title: what it does, or why it is off. */
  description?: ReactNode;
  /** The row's own control at its end, usually a switch; the whole top line is its tap target. */
  control?: ReactNode;
  /** Fields that belong to this row, under its text. */
  children?: ReactNode;
  /** Makes the icon and text one tappable button (pick this account, open this item); the control stays its own target. */
  onClick?: () => void;
}

/** One line of a `SettingsGroup`: an icon chip, a title with its description and a control at the end, with the row's own fields beneath. */
function SettingsRow({
  icon,
  title,
  description,
  control,
  children,
  onClick,
}: SettingsRowProps) {
  const iconChip = (
    <span
      className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg leading-none'
      aria-hidden='true'
    >
      {icon}
    </span>
  );
  const text = (
    <span className='flex min-h-10 min-w-0 flex-1 flex-col justify-center'>
      <span className='text-foreground font-medium text-pretty'>{title}</span>
      {description && (
        <span className='text-muted-foreground block text-sm text-pretty break-words'>{description}</span>
      )}
    </span>
  );
  const controlSlot = control && <span className='flex h-10 shrink-0 items-center'>{control}</span>;

  return (
    <li className='py-3'>
      {onClick ? (
        <div className='flex items-start gap-3'>
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            className='h-auto min-w-0 flex-1 items-start justify-start gap-3 rounded-xl p-0 text-left font-normal'
            onClick={onClick}
          >
            {iconChip}
            {text}
          </Button>
          {controlSlot}
        </div>
      ) : (
        <label className='flex items-start gap-3'>
          {iconChip}
          {text}
          {controlSlot}
        </label>
      )}
      {children && <div className='mt-3 space-y-4'>{children}</div>}
    </li>
  );
}

export default SettingsRow;
