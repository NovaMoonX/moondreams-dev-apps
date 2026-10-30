import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { LIST_CARD_CLASS } from '@/ui/siteSurface';

interface SettingsGroupProps {
  title: string;
  /** One or two plain sentences under the title, before the rows. */
  description?: ReactNode;
  /** A quiet note after the rows. */
  footer?: ReactNode;
  /** Draws the rows as a card with a section title above it, for the site's own screens on their canvas. */
  isCard?: boolean;
  /** `SettingsRow`s. */
  children: ReactNode;
}

/** A named section of a settings screen: a small caps title and one hairline frame with flat rows inside. */
function SettingsGroup({
  title,
  description,
  footer,
  isCard = false,
  children,
}: SettingsGroupProps) {
  return (
    <section className={isCard ? 'space-y-3' : 'space-y-2'}>
      <div className='px-1'>
        <h3
          className={join(
            'font-semibold',
            isCard
              ? 'text-foreground text-base'
              : 'text-muted-foreground text-xs tracking-wide uppercase',
          )}
        >
          {title}
        </h3>
        {description && (
          <p className='text-muted-foreground mt-1 text-sm text-pretty'>
            {description}
          </p>
        )}
      </div>
      <ul
        className={join(
          isCard
            ? LIST_CARD_CLASS
            : 'border-border divide-border divide-y rounded-2xl border',
          'px-3',
        )}
      >
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
