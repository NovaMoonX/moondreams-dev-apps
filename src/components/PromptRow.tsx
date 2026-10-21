import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

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
  /** One 42px capsule with the icon inline, for a spot with little height to spare. */
  isCompact?: boolean;
  /** Drops the icon chip below 360px, where the words beside it get about 100px and wrap word by word. */
  isIconHiddenOnSmallest?: boolean;
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
  isCompact = false,
  isIconHiddenOnSmallest = false,
}: PromptRowProps) {
  return (
    <div
      className={join(
        'bg-accent/60 border-border flex items-center border',
        isCompact
          ? 'gap-2 rounded-full py-1 pr-1 pl-3'
          : 'gap-3 rounded-2xl py-2.5 pr-2.5 pl-3',
      )}
    >
      <span
        className={join(
          'shrink-0 leading-none',
          isIconHiddenOnSmallest && 'max-[359px]:hidden',
          !isCompact &&
            'bg-background/70 border-border grid size-10 place-items-center rounded-full border text-lg',
        )}
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
        className={join(
          'border-foreground/30 bg-background shrink-0 font-medium',
          isCompact
            ? "relative h-8 px-3 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
            : 'h-10 px-4',
        )}
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
