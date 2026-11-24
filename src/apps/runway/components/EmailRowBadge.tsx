import type { LucideIcon } from 'lucide-react';

interface EmailRowBadgeProps {
  icon: LucideIcon;
}

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
