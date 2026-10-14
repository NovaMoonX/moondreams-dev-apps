import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ActionRowProps {
  icon: ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
  isDisabled?: boolean;
  /** Sits at the row's right edge beside its button, not inside it (a help icon). */
  trailing?: ReactNode;
}

/** A tinted row for a drawer's block of actions. */
function ActionRow({
  icon,
  label,
  subtitle,
  onClick,
  isDisabled = false,
  trailing,
}: ActionRowProps) {
  const hasTrailing = Boolean(trailing);

  return (
    <div
      className={join(
        'bg-muted/50 border-border overflow-hidden rounded-2xl border',
        hasTrailing && 'flex items-center',
      )}
    >
      <Button
        type='button'
        variant='tertiary'
        disabled={isDisabled}
        className={join(
          'text-foreground! h-auto min-h-12 w-full justify-start gap-3 rounded-none py-2 text-left',
          hasTrailing && 'min-w-0 flex-1',
        )}
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
      {hasTrailing && (
        <span className='mr-1 flex size-10 shrink-0 items-center justify-center'>
          {trailing}
        </span>
      )}
    </div>
  );
}

export default ActionRow;
