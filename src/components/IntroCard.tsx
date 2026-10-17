import type { ReactNode } from 'react';

interface IntroCardProps {
  icon: ReactNode;
  /** What is about to happen, in one plain sentence. */
  lead: ReactNode;
  /** One quieter sentence after it: what stays untouched, or what comes next. */
  children?: ReactNode;
}

/** A tinted block at the top of a screen that says what will happen to what the person brings, before they paste or choose anything. */
function IntroCard({ icon, lead, children }: IntroCardProps) {
  return (
    <div className='bg-accent/60 border-border/60 flex items-start gap-3 rounded-2xl border p-4 [@media(min-height:700px)]:p-5'>
      <span
        className='bg-card border-border/60 grid size-10 shrink-0 place-items-center rounded-xl border text-xl leading-none'
        aria-hidden='true'
      >
        {icon}
      </span>
      <div className='min-w-0 flex-1 space-y-1 text-sm'>
        <p className='text-foreground font-medium'>{lead}</p>
        {children && <p className='text-muted-foreground'>{children}</p>}
      </div>
    </div>
  );
}

export default IntroCard;
