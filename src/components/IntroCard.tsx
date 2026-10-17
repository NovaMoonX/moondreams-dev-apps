import type { ReactNode } from 'react';

interface IntroCardProps {
  icon: ReactNode;
  /** What is about to happen, in one plain sentence. */
  lead: ReactNode;
  /** One quieter sentence after it, in the same paragraph: what stays untouched, or what comes next. */
  children?: ReactNode;
}

/** A tinted block at the top of a screen that says what will happen to what the person brings, before they paste or choose anything. */
function IntroCard({ icon, lead, children }: IntroCardProps) {
  return (
    <div className='bg-accent/60 border-border flex items-start gap-2.5 rounded-2xl border p-3'>
      <span className='text-xl leading-none' aria-hidden='true'>
        {icon}
      </span>
      <p className='min-w-0 flex-1 text-sm text-pretty'>
        <span className='text-foreground font-medium'>{lead}</span>
        {children && <span className='text-muted-foreground'> {children}</span>}
      </p>
    </div>
  );
}

export default IntroCard;
