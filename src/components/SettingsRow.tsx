import type { ReactNode } from 'react';

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
}

/** One line of a `SettingsGroup`: an icon chip, a title with its description and a control at the end, with the row's own fields beneath. */
function SettingsRow({
  icon,
  title,
  description,
  control,
  children,
}: SettingsRowProps) {
  return (
    <li className='py-3'>
      <label className='flex items-start gap-3'>
        <span
          className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-lg leading-none'
          aria-hidden='true'
        >
          {icon}
        </span>
        <span className='flex min-h-10 min-w-0 flex-1 flex-col justify-center'>
          <span className='text-foreground font-medium text-pretty'>
            {title}
          </span>
          {description && (
            <span className='text-muted-foreground block text-sm text-pretty'>
              {description}
            </span>
          )}
        </span>
        {control && (
          <span className='flex h-10 shrink-0 items-center'>{control}</span>
        )}
      </label>
      {children && <div className='mt-3 space-y-4'>{children}</div>}
    </li>
  );
}

export default SettingsRow;
