import type { LucideIcon } from 'lucide-react';

interface EmailRowBadgeProps {
  icon: LucideIcon;
}

/** The square a row on the email screen wears in place of a letter: an icon for what kind of sender or what became of the email. */
function EmailRowBadge({ icon: Icon }: EmailRowBadgeProps) {
  return (
    <span
      className='border-border bg-accent text-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
      aria-hidden='true'
    >
      <Icon className='size-5' />
    </span>
  );
}

export default EmailRowBadge;
