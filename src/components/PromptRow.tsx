import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

interface PromptRowProps {
  /** An emoji or a small icon for the chip at the left. */
  icon: ReactNode;
  /** What wants a look, in one plain sentence. */
  title: string;
  /** One quieter line under the title; leave it out when the title says it all. */
  detail?: string;
  /** The one thing the row offers, named by its outcome. */
  actionLabel: string;
  onAction: () => void;
  isBusy?: boolean;
  isDisabled?: boolean;
}

/** A quiet tinted row above a list that says something there wants a look and puts the one action beside it, so the fix is one tap and never a banner. It draws only while there is something to say. */
function PromptRow({
  icon,
  title,
  detail,
  actionLabel,
  onAction,
  isBusy = false,
  isDisabled = false,
}: PromptRowProps) {
  return (
    <div className='bg-accent/60 border-border flex items-center gap-3 rounded-2xl border py-2.5 pr-2.5 pl-3'>
      <span
        className='bg-background/70 border-border grid size-10 shrink-0 place-items-center rounded-full border text-lg leading-none'
        aria-hidden='true'
      >
        {icon}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-foreground text-sm font-medium text-pretty'>
          {title}
        </p>
        {detail && (
          <p className='text-muted-foreground text-xs text-pretty'>{detail}</p>
        )}
      </div>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className='border-foreground/30 bg-background h-10 shrink-0 px-4 font-medium'
        loading={isBusy}
        disabled={isDisabled}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

export default PromptRow;
