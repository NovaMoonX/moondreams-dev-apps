import type { ReactNode } from 'react';

interface ActionTitleProps {
  children: ReactNode;
}

/** The one question an action view asks, in large type. */
export function ActionTitle({ children }: ActionTitleProps) {
  return <h3 className='text-2xl font-semibold break-words'>{children}</h3>;
}

interface ActionSectionProps {
  caption: string;
  children: ReactNode;
}

/** A section of an action view: one muted caption over its control, card or chips, the same in every view an action leads to. */
export function ActionSection({ caption, children }: ActionSectionProps) {
  return (
    <section aria-label={caption} className='space-y-1.5'>
      <p className='text-muted-foreground text-xs font-medium'>{caption}</p>
      {children}
    </section>
  );
}
