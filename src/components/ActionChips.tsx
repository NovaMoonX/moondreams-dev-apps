import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export interface ActionChip {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** Red, for a chip that takes something away: a red hairline and red text on no fill, so it stays quiet beside the others. */
  isDestructive?: boolean;
  /** The full phrase, for screen readers and the hover title, when the label is a short form of it. */
  description?: string;
  /** No fill and muted text, for a dismissal beside the chip it dismisses. */
  isQuiet?: boolean;
}

interface ActionChipsProps {
  actions: ActionChip[];
  /** Names the group for screen readers. */
  label?: string;
  /** Draws each chip as its icon alone in a 40px circle; the label stays as its accessible name. */
  isIconOnly?: boolean;
  className?: string;
}

/** A sheet's actions as one wrapped row of quiet, solid-edged buttons, so they never sit as a block between two parts of what the person reads. */
function ActionChips({
  actions,
  label,
  isIconOnly = false,
  className,
}: ActionChipsProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      role='group'
      aria-label={label}
      className={join('flex flex-wrap gap-2', className)}
    >
      {actions.map((action) => (
        <Button
          key={action.key}
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          aria-label={
            action.description ?? (isIconOnly ? action.label : undefined)
          }
          title={action.description ?? (isIconOnly ? action.label : undefined)}
          disabled={action.isDisabled || action.isLoading}
          loading={action.isLoading}
          onClick={action.onClick}
          className={join(
            'h-auto min-h-10 max-w-full gap-1.5 border px-3 py-1.5 text-left font-medium whitespace-normal',
            isIconOnly && 'size-10 shrink-0 justify-center px-0 py-0',
            action.isDestructive
              ? 'border-destructive/40 text-destructive! hover:bg-destructive/10'
              : action.isQuiet
                ? 'border-border/70 text-muted-foreground! hover:bg-muted/50 bg-transparent'
                : 'bg-muted/50 border-border text-foreground! hover:bg-muted',
          )}
        >
          <span className='shrink-0' aria-hidden='true'>
            {action.icon}
          </span>
          {!isIconOnly && <span>{action.label}</span>}
        </Button>
      ))}
    </div>
  );
}

export default ActionChips;
