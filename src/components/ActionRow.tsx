import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface ActionRowProps {
  icon: ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
  isDisabled?: boolean;
}

/** A tinted row in a drawer's block of actions: an icon, what it does, and a line on what to expect. */
function ActionRow({
  icon,
  label,
  subtitle,
  onClick,
  isDisabled = false,
}: ActionRowProps) {
  return (
    <div className='bg-muted/50 border-border overflow-hidden rounded-2xl border'>
      <Button
        type='button'
        variant='tertiary'
        disabled={isDisabled}
        className='text-foreground! h-auto min-h-12 w-full justify-start gap-3 rounded-none py-2 text-left'
        onClick={onClick}
      >
        <span className='w-5 shrink-0' aria-hidden='true'>
          {icon}
        </span>
        <span className='min-w-0 text-left'>
          <span className='block'>{label}</span>
          <span className='text-muted-foreground block text-xs font-normal'>
            {subtitle}
          </span>
        </span>
      </Button>
    </div>
  );
}

export default ActionRow;
