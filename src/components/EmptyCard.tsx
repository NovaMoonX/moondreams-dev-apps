import type { ReactNode } from 'react';

interface EmptyCardProps {
  /** An emoji for the chip at the left. */
  icon: ReactNode;
  /** What is empty and what to do about it, in one plain sentence. */
  children: ReactNode;
  /** The one thing to do when the screen's header does not already offer it. */
  action?: ReactNode;
}

/** The tinted block a screen draws when the person has nothing in it yet, so a first run is a card and not a bare line. */
function EmptyCard({ icon, children, action }: EmptyCardProps) {
  return (
    <div className='bg-accent/60 border-border flex items-start gap-3 rounded-2xl border p-4'>
      <span
        className='bg-background/70 border-border grid size-10 shrink-0 place-items-center rounded-full border text-lg leading-none'
        aria-hidden='true'
      >
        {icon}
      </span>
      <div className='min-w-0 flex-1 space-y-3'>
        <div className='flex min-h-10 items-center text-sm text-pretty'>
          <p>{children}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export default EmptyCard;
