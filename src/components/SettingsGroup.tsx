import type { ReactNode } from 'react';

interface SettingsGroupProps {
  title: string;
  /** One or two plain sentences under the title, before the rows. */
  description?: ReactNode;
  /** A quiet note after the rows. */
  footer?: ReactNode;
  /** `SettingsRow`s. */
  children: ReactNode;
}

/** A named section of a settings screen: a small caps title and one hairline frame with flat rows inside. */
function SettingsGroup({
  title,
  description,
  footer,
  children,
}: SettingsGroupProps) {
  return (
    <section className='space-y-2'>
      <div className='px-1'>
        <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {title}
        </h3>
        {description && (
          <p className='text-muted-foreground mt-1 text-sm text-pretty'>
            {description}
          </p>
        )}
      </div>
      <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
        {children}
      </ul>
      {footer && (
        <div className='text-muted-foreground space-y-1 px-1 text-xs text-pretty'>
          {footer}
        </div>
      )}
    </section>
  );
}

export default SettingsGroup;
